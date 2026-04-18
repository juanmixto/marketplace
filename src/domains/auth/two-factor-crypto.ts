/**
 * AES-256-GCM at-rest encryption for 2FA secrets (#551 follow-up).
 *
 * Split out from two-factor.ts so unit tests can exercise the
 * crypto primitives without pulling in the Prisma client via the
 * db import chain.
 */

import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const KEY_INFO = 'user-two-factor:v1'

function getEncryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  const material = secret
    ? Buffer.from(secret)
    : Buffer.from('dev-only-fallback-do-not-use-in-prod')
  // hkdfSync returns ArrayBuffer in recent Node typings; wrap it.
  const derived = crypto.hkdfSync(
    'sha256',
    material,
    Buffer.alloc(0),
    Buffer.from(KEY_INFO),
    32
  )
  return Buffer.from(derived)
}

// GCM authentication-tag length. 16 bytes (128 bits) is the
// standard full-length tag; we always emit that on encrypt and
// pin the same size on decrypt via the authTagLength option so
// createDecipheriv cannot be tricked into accepting a truncated
// tag (semgrep javascript.node-crypto.security.gcm-no-tag-length).
const GCM_TAG_BYTES = 16

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, getEncryptionKey(), iv, {
    authTagLength: GCM_TAG_BYTES,
  })
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Wire format: iv.ct.tag, all base64. Tag last so we can parse
  // without a length prefix.
  return `${iv.toString('base64')}.${ct.toString('base64')}.${tag.toString('base64')}`
}

export function decryptSecret(wire: string): string {
  const [ivB64, ctB64, tagB64] = wire.split('.')
  if (!ivB64 || !ctB64 || !tagB64) throw new Error('invalid_ciphertext')
  const tagBuf = Buffer.from(tagB64, 'base64')
  // Defence in depth: reject truncated tags before handing to
  // the decipher. setAuthTag accepts 4–16 byte tags by default,
  // and a 4-byte tag has only 32 bits of auth entropy — brute-
  // forceable.
  if (tagBuf.length !== GCM_TAG_BYTES) throw new Error('invalid_ciphertext')
  const decipher = crypto.createDecipheriv(
    ALGO,
    getEncryptionKey(),
    Buffer.from(ivB64, 'base64'),
    { authTagLength: GCM_TAG_BYTES }
  )
  decipher.setAuthTag(tagBuf)
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ])
  return pt.toString('utf8')
}
