import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import type { Adapter } from 'next-auth/adapters'
import type { JWT } from 'next-auth/jwt'
import Credentials from 'next-auth/providers/credentials'
import { db } from '@/lib/db'
import { authConfig } from './auth-config'
import { applyNormalizedAuthHostEnv } from './auth-host'
import { coerceUserRole } from '@/lib/roles'
// eslint-disable-next-line no-restricted-imports -- credentials.ts is Prisma-backed and stays out of the auth barrel; src/lib/auth.ts is the only consumer
import { authorizeCredentials } from '@/domains/auth/credentials'

applyNormalizedAuthHostEnv(process.env)

const ROLE_REFRESH_INTERVAL_MS = 60_000

export async function refreshSessionClaimsFromDb(token: JWT, trigger?: string): Promise<JWT> {
  const id = typeof token.id === 'string' ? token.id : null
  if (!id) return token

  const now = Date.now()
  const fresh = await db.user.findUnique({
    where: { id },
    select: { role: true, isActive: true, authVersion: true },
  })
  if (!fresh) return token

  const tokenAuthVersion = typeof token.authVersion === 'number' ? token.authVersion : null
  if (tokenAuthVersion === null) {
    token.authVersion = fresh.authVersion
  } else if (tokenAuthVersion !== fresh.authVersion) {
    token.isActive = false
    return token
  }

  if (!fresh.isActive) {
    token.isActive = false
    return token
  }

  token.isActive = true
  const lastCheck = typeof token.roleCheckedAt === 'number' ? token.roleCheckedAt : 0
  if (trigger !== 'update' && now - lastCheck < ROLE_REFRESH_INTERVAL_MS) {
    return token
  }

  token.role = coerceUserRole(fresh.role)
  token.roleCheckedAt = now
  return token
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db) as Adapter,
  trustHost: true,
  session: { strategy: 'jwt' },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      // Delegate initial login to the shared (edge-safe) callback.
      const base = await authConfig.callbacks?.jwt?.({ token, user, trigger })
      const next = base ?? token
      if (user) return next
      return refreshSessionClaimsFromDb(next, trigger)
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: authorizeCredentials,
    }),
  ],
})
