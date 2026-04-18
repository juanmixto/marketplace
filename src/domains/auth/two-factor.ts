/**
 * TOTP (RFC 6238) second-factor support for admin accounts.
 *
 * Secrets at rest are AES-256-GCM encrypted with a key derived from
 * AUTH_SECRET via HKDF, so a DB or backup leak alone is not enough
 * to impersonate an admin — the attacker also needs the server
 * pepper.
 *
 * Replay protection: each successful verify records the `timeStep`
 * (RFC 6238 T) returned by otplib. A later verify rejects any token
 * whose step is ≤ lastUsedStep, so the same 30 s window can only be
 * consumed once even if an attacker screenshots / shares the code.
 * The ±30 s tolerance absorbs clock drift between the server and
 * the user's phone; replay is still blocked by the step check.
 */

import {
  generateSecret,
  generateURI,
  NobleCryptoPlugin,
  ScureBase32Plugin,
} from 'otplib'
import { verifySync as totpVerifySync } from '@otplib/totp'
import QRCode from 'qrcode'
import { db } from '@/lib/db'
import { encryptSecret, decryptSecret } from './two-factor-crypto'

// Re-export so existing importers of '@/domains/auth/two-factor'
// still resolve the crypto helpers.
export { encryptSecret, decryptSecret }

// otplib v13 is "bring your own crypto" — wire the default Noble
// (pure JS) plugin and the Scure base32 codec. Passing them on each
// call rather than via a module-level default lets the helper stay
// stateless across bundler boundaries (Edge / Node).
const CRYPTO = new NobleCryptoPlugin()
const BASE32 = new ScureBase32Plugin()

/**
 * Begin enrollment: create (or rotate) a TOTP secret for `userId`
 * and return the otpauth:// URI + base64 QR data URL. The record
 * is stored with `enabledAt: null` until the user proves they've
 * configured an authenticator by completing `verifyEnrollment`.
 */
export async function startEnrollment(
  userId: string,
  accountLabel: string
): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
  const secret = generateSecret({ crypto: CRYPTO, base32: BASE32 }) // base32, 20 bytes

  const encrypted = encryptSecret(secret)

  await db.userTwoFactor.upsert({
    where: { userId },
    create: { userId, secretEncrypted: encrypted },
    update: { secretEncrypted: encrypted, enabledAt: null, lastUsedStep: null },
  })

  const otpauthUrl = generateURI({
    strategy: 'totp',
    issuer: 'Marketplace',
    label: accountLabel,
    secret,
  })
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 })

  return { secret, otpauthUrl, qrDataUrl }
}

/**
 * Verify the first code from the authenticator and flip the record
 * from pending to enabled.
 */
export async function verifyEnrollment(
  userId: string,
  code: string
): Promise<boolean> {
  const record = await db.userTwoFactor.findUnique({ where: { userId } })
  if (!record) return false

  const secret = decryptSecret(record.secretEncrypted)
  const result = totpVerifySync({
    secret,
    token: code,
    crypto: CRYPTO,
    base32: BASE32,
    // ±30 s tolerance to absorb phone clock drift.
    epochTolerance: 30,
  })
  if (!result.valid) return false

  await db.userTwoFactor.update({
    where: { userId },
    data: {
      enabledAt: record.enabledAt ?? new Date(),
      lastUsedStep: BigInt(result.timeStep),
    },
  })
  return true
}

/**
 * Login-time check. Returns true iff:
 *   - 2FA is enabled AND
 *   - the code matches within the ±30 s window AND
 *   - its timeStep is strictly newer than the previously accepted
 *     one (replay protection via otplib's afterTimeStep guard).
 */
export async function verifyLoginCode(
  userId: string,
  code: string
): Promise<boolean> {
  const record = await db.userTwoFactor.findUnique({ where: { userId } })
  if (!record || !record.enabledAt) return false

  const secret = decryptSecret(record.secretEncrypted)
  const afterStep = record.lastUsedStep != null ? Number(record.lastUsedStep) : undefined

  const result = totpVerifySync({
    secret,
    token: code,
    crypto: CRYPTO,
    base32: BASE32,
    epochTolerance: 30,
    afterTimeStep: afterStep,
  })
  if (!result.valid) return false

  await db.userTwoFactor.update({
    where: { userId },
    data: { lastUsedStep: BigInt(result.timeStep) },
  })
  return true
}

export async function isTwoFactorEnabled(userId: string): Promise<boolean> {
  const record = await db.userTwoFactor.findUnique({
    where: { userId },
    select: { enabledAt: true },
  })
  return Boolean(record?.enabledAt)
}

/** Abort a pending enrollment or disable 2FA entirely. */
export async function disableTwoFactor(userId: string): Promise<void> {
  await db.userTwoFactor.deleteMany({ where: { userId } })
}
