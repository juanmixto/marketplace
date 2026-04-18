import bcrypt from 'bcryptjs'
import { z } from 'zod'
import type { UserRole } from '@/generated/prisma/enums'
import { db } from '@/lib/db'
import { checkRateLimit } from '@/lib/ratelimit'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export interface AuthenticatedUser {
  id: string
  email: string
  name: string
  image: string | null
  role: UserRole
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

  return {
    id: user.id,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    image: user.image,
    role: user.role,
  }
}
