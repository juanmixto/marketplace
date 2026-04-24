/**
 * Trusted-device cookie for admin 2FA (issue: two-step admin login).
 *
 * After a successful TOTP verification, if the admin opts to trust the
 * device, we mint an HMAC-signed cookie that lets subsequent logins
 * from the same browser skip the second factor for 30 days. The cookie
 * is bound to the user id AND a fingerprint of the current password
 * hash, so a password change (via reset or /cuenta change-password)
 * invalidates every trusted device automatically without needing a
 * separate revocation table.
 *
 * Wire format: `v1.<userId-b64url>.<exp>.<pwdFp>.<sig-b64url>`
 * where sig = HMAC-SHA256(v1.userId.exp.pwdFp) under a key derived
 * from AUTH_SECRET via HKDF (separate info string from 2fa-at-rest
 * encryption so the two keys never collide).
 *
 * Kept out of the `@/domains/auth` barrel because it depends on
 * next/headers cookies() — pulling it into a shared barrel would
 * contaminate any edge consumer.
 */

import crypto from 'crypto'
import { cookies } from 'next/headers'
import { isSecureAuthDeployment } from '@/lib/auth-env'

const COOKIE_BASE = 'admin-2fa-trust'
const TTL_SECONDS = 30 * 24 * 60 * 60
const VERSION = 'v1'
const HKDF_INFO = 'admin-2fa-trust:v1'

function getCookieName(): string {
  return isSecureAuthDeployment(process.env) ? `__Secure-${COOKIE_BASE}` : COOKIE_BASE
}

function getSigningKey(): Buffer {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  const material = secret
    ? Buffer.from(secret)
    : Buffer.from('dev-only-fallback-do-not-use-in-prod')
  const derived = crypto.hkdfSync(
    'sha256',
    material,
    Buffer.alloc(0),
    Buffer.from(HKDF_INFO),
    32
  )
  return Buffer.from(derived)
}

function hashPasswordFingerprint(passwordHash: string): string {
  // 12-char prefix of a SHA-256 is plenty to detect a password change
  // (~72 bits) without leaking the bcrypt hash itself into a client-
  // readable envelope (the HMAC still covers the full payload).
  return crypto.createHash('sha256').update(passwordHash).digest('base64url').slice(0, 12)
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSigningKey()).update(payload).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'base64url')
  const bb = Buffer.from(b, 'base64url')
  if (ab.length !== bb.length || ab.length === 0) return false
  return crypto.timingSafeEqual(ab, bb)
}

export async function issueTrustedDeviceCookie(
  userId: string,
  passwordHash: string
): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS
  const fp = hashPasswordFingerprint(passwordHash)
  const userIdB64 = Buffer.from(userId).toString('base64url')
  const body = `${VERSION}.${userIdB64}.${exp}.${fp}`
  const value = `${body}.${sign(body)}`
  const store = await cookies()
  store.set(getCookieName(), value, {
    httpOnly: true,
    secure: isSecureAuthDeployment(process.env),
    sameSite: 'strict',
    path: '/',
    maxAge: TTL_SECONDS,
  })
}

/**
 * Returns true iff the current request carries a valid trusted-device
 * cookie for `expectedUserId` AND the user's current password hash
 * still matches the fingerprint embedded in the cookie (changed
 * password => invalidated device).
 */
export async function verifyTrustedDeviceCookie(
  expectedUserId: string,
  currentPasswordHash: string
): Promise<boolean> {
  const store = await cookies()
  const raw = store.get(getCookieName())?.value
  if (!raw) return false

  const parts = raw.split('.')
  if (parts.length !== 5) return false
  const [version, userIdB64, expStr, fp, sig] = parts
  if (version !== VERSION) return false

  const body = `${version}.${userIdB64}.${expStr}.${fp}`
  if (!safeEqual(sig!, sign(body))) return false

  const exp = Number(expStr)
  if (!Number.isFinite(exp) || Math.floor(Date.now() / 1000) >= exp) return false

  let userId: string
  try {
    userId = Buffer.from(userIdB64!, 'base64url').toString('utf8')
  } catch {
    return false
  }
  if (userId !== expectedUserId) return false

  if (fp !== hashPasswordFingerprint(currentPasswordHash)) return false

  return true
}

export async function clearTrustedDeviceCookie(): Promise<void> {
  const store = await cookies()
  store.delete(getCookieName())
}
