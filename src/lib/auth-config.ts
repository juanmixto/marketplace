// Auth config shared between middleware (edge) and server code.
// Must NOT import Prisma or any Node.js-only module.
import type { NextAuthConfig } from 'next-auth'
import { coerceUserRole, isAdmin, isVendor } from '@/lib/roles'
import { sanitizeCallbackUrl } from '@/lib/portals'

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
  const authUrl = env.AUTH_URL ?? env.NEXTAUTH_URL
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
        // 2FA claim — set on initial login, consumed by src/proxy.ts
        // to force admins without 2FA to /admin/security/enroll.
        token.has2fa = (user as { has2fa?: boolean }).has2fa ?? false
        // Onboarding claim — proxy.ts redirects to /onboarding when
        // true. Defaults false for credentials (they consent at
        // /register); the OAuth jwt callback in src/lib/auth.ts
        // overrides this on first OAuth signin via a DB lookup.
        token.needsOnboarding = (user as { needsOnboarding?: boolean }).needsOnboarding ?? false
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = coerceUserRole(token.role)
        ;(session.user as { has2fa?: boolean }).has2fa = Boolean(token.has2fa)
        ;(session.user as { needsOnboarding?: boolean }).needsOnboarding = Boolean(
          token.needsOnboarding
        )
      }
      return session
    },
    /**
     * Defense-in-depth callback. Auth.js already blocks cross-origin
     * redirects, but for OAuth flows the IdP returns the user to the
     * `redirectTo` we set. Without this gate, any same-origin path
     * could be the post-login destination — including paths the rest
     * of the app rejects (`/api/*`, `/login`, etc.). Re-running
     * `sanitizeCallbackUrl` here keeps the OAuth path under the same
     * allow-list as the credentials path. Edge-safe (sanitize uses
     * only String/URL primitives).
     */
    redirect({ url, baseUrl }) {
      let candidate: string = url
      try {
        if (!url.startsWith('/')) {
          const parsed = new URL(url)
          const base = new URL(baseUrl)
          if (parsed.origin !== base.origin) return baseUrl
          candidate = `${parsed.pathname}${parsed.search}${parsed.hash}`
        }
      } catch {
        return baseUrl
      }
      // The OAuth signIn callback (#850 matrix case D) returns
      // `/login/link?token=<HMAC>` to hand off a colliding signin
      // to the password gate (#854-lite). sanitizeCallbackUrl
      // rejects anything starting with `/login` (loop guard for
      // generic callback URLs) so we whitelist the link path
      // explicitly here. The token itself is HMAC-validated by
      // the page; passing through unsanitized is safe.
      const pathOnly = candidate.split('?')[0]!.split('#')[0]!
      if (pathOnly === '/login/link' || pathOnly.startsWith('/login/link/')) {
        try {
          return new URL(candidate, baseUrl).toString()
        } catch {
          return baseUrl
        }
      }
      const safe = sanitizeCallbackUrl(candidate)
      if (!safe) return baseUrl
      try {
        return new URL(safe, baseUrl).toString()
      } catch {
        return baseUrl
      }
    },
  },
  providers: [], // filled in auth.ts (server-only)
}
