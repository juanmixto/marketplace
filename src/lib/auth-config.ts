// Auth config shared between middleware (edge) and server code.
// Must NOT import Prisma or any Node.js-only module.
import type { NextAuthConfig } from 'next-auth'
import { coerceUserRole, isAdmin, isVendor } from '@/lib/roles'
import { resolveAuthUrl } from '@/lib/auth-env'

// Behind the Cloudflare Tunnel (dev) / HTTPS terminator (prod), the
// Next.js server sees requests as http://localhost internally. Auth.js
// v5 derives `useSecureCookies` from `url.protocol` and, in Route
// Handlers, that URL is the internal http:// one — so it falls back to
// the non-prefixed `authjs.session-token` cookie name while the login
// callback actually wrote `__Secure-authjs.session-token`. That leaves
// `auth()` in /api/* route handlers unable to read a valid session
// (server components read via next/headers and are unaffected).
// Forcing useSecureCookies based on AUTH_URL matches the proxy fix in
// #597 and keeps dev (http) working when AUTH_URL is unset.
export function resolveUseSecureCookies(
  env: Record<string, string | undefined> = process.env
): boolean {
  const authUrl = resolveAuthUrl(env)
  return authUrl?.startsWith('https://') ?? false
}

export const authConfig: NextAuthConfig = {
  useSecureCookies: resolveUseSecureCookies(),
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const pathname = nextUrl.pathname

      const isAdminRoute = pathname.startsWith('/admin')
      const isVendorRoute = pathname.startsWith('/vendor')
      const isBuyerRoute = ['/carrito', '/checkout', '/cuenta'].some(p => pathname.startsWith(p))

      if (isAdminRoute) {
        return isLoggedIn && isAdmin(auth?.user?.role)
      }

      if (isVendorRoute) {
        return isLoggedIn && isVendor(auth?.user?.role)
      }

      if (isBuyerRoute) {
        return isLoggedIn
      }

      return true
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? ''
        token.role = coerceUserRole(user.role)
        token.isActive = (user as { isActive?: boolean }).isActive ?? true
        token.authVersion = (user as { authVersion?: number }).authVersion ?? 0
        // 2FA claim — set on initial login, consumed by src/proxy.ts
        // to force admins without 2FA to /admin/security/enroll.
        token.has2fa = (user as { has2fa?: boolean }).has2fa ?? false
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = coerceUserRole(token.role)
        session.user.isActive = token.isActive ?? true
        session.user.authVersion = token.authVersion ?? 0
        ;(session.user as { has2fa?: boolean }).has2fa = Boolean(token.has2fa)
      }
      return session
    },
  },
  providers: [], // filled in auth.ts (server-only)
}
