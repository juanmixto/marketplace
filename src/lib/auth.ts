import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import type { Adapter } from 'next-auth/adapters'
import Credentials from 'next-auth/providers/credentials'
import { db } from '@/lib/db'
import { authConfig } from './auth-config'
import { applyNormalizedAuthHostEnv } from './auth-host'
import { coerceUserRole } from '@/lib/roles'
// eslint-disable-next-line no-restricted-imports -- credentials.ts is Prisma-backed and stays out of the auth barrel; src/lib/auth.ts is the only consumer
import { authorizeCredentials } from '@/domains/auth/credentials'

applyNormalizedAuthHostEnv(process.env)

const ROLE_REFRESH_INTERVAL_MS = 60_000

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

      // Refresh the role from the DB at most once per interval so an admin
      // promotion (CUSTOMER → VENDOR via approveVendor) lands in the JWT on
      // the next poll instead of requiring a sign-out. Sessions with no id
      // (anonymous) are skipped. This is the only place in the stack where
      // a role can change mid-session without a credentials flow.
      const id = typeof next.id === 'string' ? next.id : null
      if (!id) return next

      const lastCheck = typeof next.roleCheckedAt === 'number' ? next.roleCheckedAt : 0
      const now = Date.now()
      if (trigger !== 'update' && now - lastCheck < ROLE_REFRESH_INTERVAL_MS) {
        return next
      }

      const fresh = await db.user.findUnique({
        where: { id },
        select: { role: true, isActive: true },
      })
      if (!fresh || !fresh.isActive) return next
      next.role = coerceUserRole(fresh.role)
      next.roleCheckedAt = now
      return next
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
