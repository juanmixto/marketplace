import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

export function createLoginRedirectUrl(request: Pick<NextRequest, 'url' | 'nextUrl'>) {
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('callbackUrl', `${request.nextUrl.pathname}${request.nextUrl.search}`)
  return loginUrl
}

export { auth as proxy }

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
