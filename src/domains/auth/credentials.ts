import bcrypt from 'bcryptjs'
import { z } from 'zod'
import type { UserRole } from '@/generated/prisma/enums'
import { db } from '@/lib/db'
import { isAdminRole } from '@/lib/roles'
import { checkRateLimit } from '@/lib/ratelimit'
import { isTwoFactorEnabled, verifyLoginCode } from '@/domains/auth/two-factor'
import {
  issueTrustedDeviceCookie,
  verifyTrustedDeviceCookie,
} from '@/domains/auth/trusted-device'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  // Optional TOTP code. Admins with 2FA enrolled must include it
  // (unless a valid trusted-device cookie is present for this user);
  // accounts without 2FA leave it blank. 6–8 digits covers both the
  // standard 6-digit TOTP and longer formats some authenticators use.
  totpCode: z.string().trim().min(6).max(10).regex(/^\d+$/).optional(),
  // Two-step login UX: when the admin checks "trust this device" on
  // the TOTP step, mint a signed cookie that lets the next 30 days
  // of logins from this browser skip the TOTP prompt. Arrives as
  // form-encoded "1" / "true" / "on"; we normalise below.
  rememberDevice: z.union([z.literal('1'), z.literal('true'), z.literal('on')]).optional(),
})

export interface AuthenticatedUser {
  id: string
  email: string
  name: string
  image: string | null
  role: UserRole
  isActive: boolean
  authVersion: number
  /** Whether the user has completed TOTP enrollment. Propagates to the
   * JWT so the proxy can force enrollment without a DB round-trip. */
  has2fa: boolean
}

// Per-identity throttle to defeat distributed brute force that rotates IPs
// against the same account. Counts every attempt against a normalized email
// (success and fail), so a legitimate user with a typo retries a few times
// without locking themselves out, but a brute-force script hits the wall.
const LOGIN_PER_EMAIL_LIMIT = 10
const LOGIN_PER_EMAIL_WINDOW_SECONDS = 15 * 60

/**
 * Validate credentials for NextAuth sign-in.
 *
 * Accounts must be active and email-verified before they can authenticate.
 * Per-identity rate limiting (#173) is applied here so the same protection
 * runs whether the entry point is the NextAuth POST handler, a server
 * action, or a future API surface.
 */
export async function authorizeCredentials(credentials: unknown): Promise<AuthenticatedUser | null> {
  const parsed = credentialsSchema.safeParse(credentials)

  if (!parsed.success) return null

  const normalizedEmail = parsed.data.email.trim().toLowerCase()

  const identityLimit = await checkRateLimit(
    'login-identity',
    normalizedEmail,
    LOGIN_PER_EMAIL_LIMIT,
    LOGIN_PER_EMAIL_WINDOW_SECONDS,
    { failClosed: true }
  )

  if (!identityLimit.success) {
    // Same return shape as a wrong password — never differentiate, both to
    // avoid leaking which accounts are under attack and to keep the existing
    // UX for legitimate users.
    return null
  }

  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
  })

  if (!user || !user.passwordHash || !user.isActive || !user.emailVerified) return null

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
  if (!valid) return null

  // Persist the last successful login for support/operations. This is the
  // only activity metric we can derive with high confidence in the current
  // auth stack without inventing session-level telemetry.
  await db.user.updateMany({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  }).catch(error => {
    console.error('[auth][credentials] failed to persist lastLoginAt', {
      userId: user.id,
      error,
    })
  })

  // Second factor gate. If the user has 2FA enabled (admin or future
  // buyer opt-in), the code is required at login — unless a valid
  // trusted-device cookie proves this browser completed TOTP within
  // the last 30 days AND the password hasn't rotated since. Admins
  // WITHOUT 2FA are allowed through here but the proxy forces them
  // to /admin/security/enroll on their next admin-route request —
  // see src/proxy.ts for the redirect.
  const has2fa = await isTwoFactorEnabled(user.id)
  void isAdminRole // kept imported for the proxy-side enforcement
  if (has2fa) {
    const code = parsed.data.totpCode
    if (code) {
      const totpOk = await verifyLoginCode(user.id, code)
      if (!totpOk) return null
      if (parsed.data.rememberDevice) {
        // Tie the trust to the hash we just verified against, so a
        // password change immediately invalidates every trusted
        // device without a separate revocation table.
        await issueTrustedDeviceCookie(user.id, user.passwordHash)
      }
    } else {
      const trusted = await verifyTrustedDeviceCookie(user.id, user.passwordHash)
      if (!trusted) return null
    }
  }

  return {
    id: user.id,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    image: user.image,
    role: user.role,
    isActive: user.isActive,
    authVersion: user.authVersion,
    has2fa,
  }
}
