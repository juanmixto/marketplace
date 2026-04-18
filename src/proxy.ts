import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { isAdmin, isVendor } from '@/lib/roles'
import { type UserRole } from '@/generated/prisma/enums'
import { getPrimaryPortalHref, sanitizeCallbackUrl } from '@/lib/portals'
import { isRequestOnAdminHost, hostMatchesAdmin, ADMIN_HOST_ENV_VAR } from '@/lib/admin-host'

// Exported so test/integration/proxy-protected-prefixes.test.ts can
// reflect the live list back against the actual src/app route tree
// and fail CI if a new authenticated route group is added without
// being added here.
export const PROTECTED_PREFIXES = ['/admin', '/vendor', '/carrito', '/checkout', '/cuenta'] as const

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

// Defense-in-depth CSRF check for mutating /api/* JSON endpoints (#543).
// NextAuth session cookies are SameSite=Lax, which blocks most cross-site
// POSTs already, but a subdomain takeover or misconfigured CORS can bypass
// SameSite. Rejecting requests whose Origin doesn't match the app origin
// closes that gap without breaking first-party callers (browsers always
// send Origin on fetch from the same origin).
//
// Exemptions:
//   - webhooks (Stripe, Sendcloud, Telegram) have no browser Origin
//   - /api/auth/* is handled by NextAuth which has its own CSRF token
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const CSRF_EXEMPT_PREFIXES = ['/api/auth', '/api/webhooks', '/api/healthcheck'] as const

function requiresOriginCheck(pathname: string, method: string): boolean {
  if (!pathname.startsWith('/api/')) return false
  if (!MUTATING_METHODS.has(method)) return false
  return !CSRF_EXEMPT_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

function isOriginAllowed(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  // Same-origin fetches always carry Origin; missing Origin+Referer on a
  // state-changing request is a strong signal of a curl / script client,
  // which we treat as not a browser CSRF concern. Server-to-server
  // integrations should hit the exempt webhook paths.
  if (!origin && !referer) return true

  const expectedOrigin = new URL(request.url).origin
  if (origin && origin === expectedOrigin) return true
  if (referer) {
    try {
      if (new URL(referer).origin === expectedOrigin) return true
    } catch {
      // fall through to deny
    }
  }
  return false
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

  if (requiresOriginCheck(pathname, request.method) && !isOriginAllowed(request)) {
    return NextResponse.json(
      { error: 'forbidden_origin' },
      { status: 403 }
    )
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
