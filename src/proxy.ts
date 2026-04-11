import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { isAdmin, isVendor } from '@/lib/roles'
import { type UserRole } from '@/generated/prisma/enums'

const PROTECTED_PREFIXES = ['/admin', '/vendor', '/carrito', '/checkout', '/cuenta'] as const

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function createLoginRedirectUrl(request: NextRequest) {
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('callbackUrl', `${request.nextUrl.pathname}${request.nextUrl.search}`)
  return loginUrl
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!isProtectedPath(pathname)) {
    return NextResponse.next()
  }

  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET })

  if (!token) {
    return NextResponse.redirect(createLoginRedirectUrl(request))
  }

  const role = typeof token.role === 'string' ? (token.role as UserRole) : undefined

  if (pathname.startsWith('/admin') && !isAdmin(role)) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (pathname.startsWith('/vendor') && !isVendor(role)) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
