import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const secret = process.env.AUTH_SECRET

function isAdmin(role: string) {
  return role.startsWith('ADMIN') || role === 'SUPERADMIN'
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
  const token = await getToken({
    req: request,
    secret,
    secureCookie: forwardedProto === 'https',
  })
  const role = (token?.role as string) ?? ''

  function redirectToLogin() {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Admin routes — need ADMIN or SUPERADMIN
  if (pathname.startsWith('/admin')) {
    if (!token || !isAdmin(role)) {
      return redirectToLogin()
    }
  }

  // Vendor portal
  if (pathname.startsWith('/vendor')) {
    if (!token || role !== 'VENDOR') {
      return redirectToLogin()
    }
  }

  // Buyer-only routes
  const buyerPaths = ['/carrito', '/checkout', '/cuenta']
  if (buyerPaths.some(p => pathname.startsWith(p))) {
    if (!token) {
      return redirectToLogin()
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
