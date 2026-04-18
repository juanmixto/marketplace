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

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, getEncryptionKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Wire format: iv.ct.tag, all base64. Tag last so we can parse
  // without a length prefix.
  return `${iv.toString('base64')}.${ct.toString('base64')}.${tag.toString('base64')}`
}

export function decryptSecret(wire: string): string {
  const [ivB64, ctB64, tagB64] = wire.split('.')
  if (!ivB64 || !ctB64 || !tagB64) throw new Error('invalid_ciphertext')
  const decipher = crypto.createDecipheriv(
    ALGO,
    getEncryptionKey(),
    Buffer.from(ivB64, 'base64')
  )
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ])
  return pt.toString('utf8')
}
