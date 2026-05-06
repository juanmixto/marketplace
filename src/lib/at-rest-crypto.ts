/**
 * AES-256-GCM at-rest encryption for column-scoped PII (#1347).
 *
 * Generalisation of the 2FA-secret crypto in
 * `src/domains/auth/two-factor-crypto.ts`. Each domain (`'vendor-iban:v1'`,
 * `'vendor-bank-name:v1'`, …) derives its OWN key from `AUTH_SECRET` via
 * HKDF, so a leak of one ciphertext class cannot decrypt another.
 *
 * Wire format `iv.ct.tag` (base64, dot-separated). The tag length is
 * pinned to 16 bytes on both encrypt and decrypt — `setAuthTag`
 * accepts 4–16 byte tags by default and a 4-byte tag has only 32 bits
 * of auth entropy. Defence in depth.
 */

import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const GCM_TAG_BYTES = 16

function getEncryptionKey(keyDomain: string): Buffer {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  const material = secret
    ? Buffer.from(secret)
    : Buffer.from('dev-only-fallback-do-not-use-in-prod')
  const derived = crypto.hkdfSync(
    'sha256',
    material,
    Buffer.alloc(0),
    Buffer.from(keyDomain),
    32,
  )
  return Buffer.from(derived)
}

export function encryptForStorage(plaintext: string, keyDomain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, getEncryptionKey(keyDomain), iv, {
    authTagLength: GCM_TAG_BYTES,
  })
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${ct.toString('base64')}.${tag.toString('base64')}`
}

export function decryptFromStorage(wire: string, keyDomain: string): string {
  const [ivB64, ctB64, tagB64] = wire.split('.')
  if (!ivB64 || !ctB64 || !tagB64) throw new Error('invalid_ciphertext')
  const tagBuf = Buffer.from(tagB64, 'base64')
  if (tagBuf.length !== GCM_TAG_BYTES) throw new Error('invalid_ciphertext')
  const decipher = crypto.createDecipheriv(
    ALGO,
    getEncryptionKey(keyDomain),
    Buffer.from(ivB64, 'base64'),
    { authTagLength: GCM_TAG_BYTES },
  )
  decipher.setAuthTag(tagBuf)
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ])
  return pt.toString('utf8')
}

/**
 * Cheap heuristic for the dual-column transition: a value that doesn't
 * have the `iv.ct.tag` shape with three base64 segments and a 16-byte
 * tag has not been encrypted by us. Used by the backfill script to
 * decide whether to encrypt a row in place. Conservatively assumes
 * "not our wire format" → "plaintext" — false positives only cost an
 * extra encrypt-noop, not data loss.
 */
export function isStorageWireFormat(value: string): boolean {
  const parts = value.split('.')
  if (parts.length !== 3) return false
  try {
    const tagBuf = Buffer.from(parts[2] ?? '', 'base64')
    return tagBuf.length === GCM_TAG_BYTES
  } catch {
    return false
  }
}
