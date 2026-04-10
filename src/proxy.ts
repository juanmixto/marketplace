import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import type { UserRole } from '@/generated/prisma/enums'
import { isAdmin, isVendor } from '@/lib/roles'

const secret = process.env.AUTH_SECRET

export function createLoginRedirectUrl(request: Pick<NextRequest, 'url' | 'nextUrl'>) {
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('callbackUrl', `${request.nextUrl.pathname}${request.nextUrl.search}`)
  return loginUrl
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
  const token = await getToken({
    req: request,
    secret,
    secureCookie: forwardedProto === 'https',
  })
  const role = (token?.role as UserRole | undefined) ?? undefined

  function redirectToLogin() {
    return NextResponse.redirect(createLoginRedirectUrl(request))
  }

  if (pathname.startsWith('/admin')) {
    if (!token || !isAdmin(role)) {
      return redirectToLogin()
    }
  }

  if (pathname.startsWith('/vendor')) {
    if (!token || !isVendor(role)) {
      return redirectToLogin()
    }
  }

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
    '/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
