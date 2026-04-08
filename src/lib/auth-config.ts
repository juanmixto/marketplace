// Auth config shared between middleware (edge) and server code.
// Must NOT import Prisma or any Node.js-only module.
import type { NextAuthConfig } from 'next-auth'
import type { UserRole } from '@/generated/prisma/enums'

export const authConfig: NextAuthConfig = {
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
        const role = auth?.user?.role ?? ''
        return isLoggedIn && (role.startsWith('ADMIN') || role === 'SUPERADMIN')
      }

      if (isVendorRoute) {
        return isLoggedIn && auth?.user?.role === 'VENDOR'
      }

      if (isBuyerRoute) {
        return isLoggedIn
      }

      return true
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? ''
        token.role = user.role as UserRole
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as UserRole
      }
      return session
    },
  },
  providers: [], // filled in auth.ts (server-only)
}
