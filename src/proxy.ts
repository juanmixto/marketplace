import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { isAdmin, isVendor } from '@/lib/roles'
import { type UserRole } from '@/generated/prisma/enums'
import { getPrimaryPortalHref, sanitizeCallbackUrl } from '@/lib/portals'
import { isRequestOnAdminHost, hostMatchesAdmin, ADMIN_HOST_ENV_VAR } from '@/lib/admin-host'
import { buildContentSecurityPolicy } from '@/lib/security-headers'

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

// Paths that don't render HTML and don't benefit from a per-request
// nonce: API routes, webhooks, Next.js internals, static assets. The
// CSP for these is either irrelevant (JSON responses) or handled by
// `next.config.ts` asset headers.
const CSP_NONCE_EXEMPT_PREFIXES = [
  '/api/',
  '/_next/',
  '/favicon.ico',
  '/manifest.webmanifest',
  '/sw.js',
] as const

function shouldApplyNonceCsp(pathname: string): boolean {
  return !CSP_NONCE_EXEMPT_PREFIXES.some(prefix =>
    prefix.endsWith('/') ? pathname.startsWith(prefix) : pathname === prefix
  )
}

function generateNonce(): string {
  // Randomness comes from Web Crypto (Edge runtime has no node:crypto).
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
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

  // Per-request CSP nonce (#537). Generated here, injected into the
  // request headers so Next.js picks it up for framework scripts and
  // server-component `next/script` usage, then echoed into the response
  // `Content-Security-Policy` header.
  const applyCspNonce = shouldApplyNonceCsp(pathname)
  const nonce = applyCspNonce ? generateNonce() : undefined
  const cspValue = applyCspNonce ? buildContentSecurityPolicy({ nonce }) : undefined

  const forwardHeaders = nonce ? new Headers(request.headers) : undefined
  if (forwardHeaders && nonce) {
    forwardHeaders.set('x-nonce', nonce)
    forwardHeaders.set('Content-Security-Policy', cspValue!)
  }

  const finalizeResponse = (response: NextResponse): NextResponse => {
    if (cspValue) response.headers.set('Content-Security-Policy', cspValue)
    return response
  }

  if (!isProtectedPath(pathname)) {
    return finalizeResponse(
      forwardHeaders
        ? NextResponse.next({ request: { headers: forwardHeaders } })
        : NextResponse.next()
    )
  }

  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET })

  if (!token) {
    return finalizeResponse(NextResponse.redirect(createLoginRedirectUrl(request)))
  }

  const role = typeof token.role === 'string' ? (token.role as UserRole) : undefined

  if (pathname.startsWith('/admin') && !isAdmin(role)) {
    return finalizeResponse(
      NextResponse.redirect(new URL(getPrimaryPortalHref(role), request.url))
    )
  }

  // Force TOTP enrollment for admin accounts that haven't set it up yet.
  // The `has2fa` claim is stamped on the JWT by authorize() in
  // src/domains/auth/credentials.ts. Once a user enrolls they must log
  // out + back in to get a fresh claim (or the enrollment endpoint can
  // rotate the session). The enrollment page itself and its API route
  // are exempt so the admin can actually complete setup.
  const has2fa = Boolean(token.has2fa)
  const ENROLL_PATH = '/admin/security/enroll'
  const enrollmentExempt =
    pathname === ENROLL_PATH ||
    pathname.startsWith(`${ENROLL_PATH}/`) ||
    pathname.startsWith('/api/admin/2fa/')
  if (
    pathname.startsWith('/admin') &&
    isAdmin(role) &&
    !has2fa &&
    !enrollmentExempt
  ) {
    return finalizeResponse(
      NextResponse.redirect(new URL(ENROLL_PATH, request.url))
    )
  }

  if (pathname.startsWith('/vendor') && !isVendor(role)) {
    return finalizeResponse(
      NextResponse.redirect(new URL(getPrimaryPortalHref(role), request.url))
    )
  }

  return finalizeResponse(
    forwardHeaders
      ? NextResponse.next({ request: { headers: forwardHeaders } })
      : NextResponse.next()
  )
}

// Re-export to keep the existing host-check tests (ticket #348) self-contained.
export { hostMatchesAdmin }

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
