import bcrypt from 'bcryptjs'
import { z } from 'zod'
import type { UserRole } from '@/generated/prisma/enums'
import { db } from '@/lib/db'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export interface AuthenticatedUser {
  id: string
  email: string
  name: string
  image: string | null
  role: UserRole
}

/**
 * Validate credentials for NextAuth sign-in.
 *
 * Accounts must be active and email-verified before they can authenticate.
 */
export async function authorizeCredentials(credentials: unknown): Promise<AuthenticatedUser | null> {
  const parsed = credentialsSchema.safeParse(credentials)

  if (!parsed.success) return null

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
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
