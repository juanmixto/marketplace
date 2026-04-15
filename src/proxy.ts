import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { isAdmin, isVendor } from '@/lib/roles'
import { type UserRole } from '@/generated/prisma/enums'
import { getPrimaryPortalHref, sanitizeCallbackUrl } from '@/lib/portals'
import { isRequestOnAdminHost, hostMatchesAdmin, ADMIN_HOST_ENV_VAR } from '@/lib/admin-host'

const PROTECTED_PREFIXES = ['/admin', '/vendor', '/carrito', '/checkout', '/cuenta'] as const

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function createLoginRedirectUrl(request: NextRequest) {
  const loginUrl = new URL('/login', request.url)
  const rawCallback = `${request.nextUrl.pathname}${request.nextUrl.search}`
  const safe = sanitizeCallbackUrl(rawCallback)
  if (safe) loginUrl.searchParams.set('callbackUrl', safe)
  return loginUrl
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ------------------------------------------------------------------
  // Admin host isolation (ticket #348). When ADMIN_HOST is configured,
  // /admin/** is only reachable on that host, and the admin host only
  // serves admin routes (everything else 404s). This is a hard gate in
  // addition to the role check below, so a stolen non-admin cookie on
  // the public host cannot pivot into the admin panel.
  // ------------------------------------------------------------------
  const adminHost = process.env[ADMIN_HOST_ENV_VAR]
  if (adminHost) {
    const onAdminHost = isRequestOnAdminHost(request)
    if (pathname.startsWith('/admin') && !onAdminHost) {
      const adminUrl = new URL(request.url)
      adminUrl.host = adminHost
      adminUrl.protocol = 'https:'
      return NextResponse.redirect(adminUrl)
    }
    if (onAdminHost && !pathname.startsWith('/admin') && !pathname.startsWith('/login') && !pathname.startsWith('/api')) {
      return new NextResponse(null, { status: 404 })
    }
  }

  if (!isProtectedPath(pathname)) {
    return NextResponse.next()
  }

  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET })

  if (!token) {
    return NextResponse.redirect(createLoginRedirectUrl(request))
  }

  const role = typeof token.role === 'string' ? (token.role as UserRole) : undefined

  if (pathname.startsWith('/admin') && !isAdmin(role)) {
    return NextResponse.redirect(new URL(getPrimaryPortalHref(role), request.url))
  }

  if (pathname.startsWith('/vendor') && !isVendor(role)) {
    return NextResponse.redirect(new URL(getPrimaryPortalHref(role), request.url))
  }

  return NextResponse.next()
}

// Re-export to keep the existing host-check tests (ticket #348) self-contained.
export { hostMatchesAdmin }

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
