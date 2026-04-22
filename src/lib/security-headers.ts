export interface SecurityHeader {
  key: string
  value: string
}

function toAbsoluteUrl(value: string | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`)
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '')
    return `${parsed.origin}${pathname}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}

function shouldEnforceHttpsHeaders() {
  const candidateUrls = [
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]

  if (process.env.VERCEL === '1' || typeof process.env.VERCEL_ENV === 'string') {
    candidateUrls.unshift(
      process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
      process.env.VERCEL_URL,
    )
  }

  return candidateUrls
    .map(value => toAbsoluteUrl(value))
    .some(value => value?.startsWith('https://') ?? false)
}

export interface BuildCspOptions {
  /**
   * Per-request random nonce. When provided, the CSP switches to a strict
   * nonce + `strict-dynamic` policy — required to drop `'unsafe-inline'`
   * from `script-src` without breaking Next.js's inline bootstrap scripts.
   * Generated in `src/proxy.ts` on every request.
   */
  nonce?: string
  isDevelopment?: boolean
}

export function buildContentSecurityPolicy(
  options: BuildCspOptions | boolean = {}
) {
  // Back-compat: callers used to pass a raw `isDevelopment` boolean.
  const { nonce, isDevelopment = process.env.NODE_ENV === 'development' } =
    typeof options === 'boolean' ? { isDevelopment: options } : options

  // script-src construction (#537):
  //   - with nonce: `'nonce-X' 'strict-dynamic'` replaces `'unsafe-inline'`,
  //     because `strict-dynamic` trusts any script loaded by a nonced script,
  //     which covers Next.js's RSC bootstrap and dynamically-imported bundles.
  //   - without nonce (fallback, test-only): keep the old permissive policy.
  const scriptSrc = nonce
    ? isDevelopment
      ? // Dev mode: drop strict-dynamic + add 'unsafe-inline'/'unsafe-eval'
        // because next-themes (and a few other libs) inject inline early-load
        // scripts without a nonce. With strict-dynamic active they get
        // blocked, hydration fails, forms fall back to native submit
        // (passwords end up in the URL, login appears broken).
        // Production keeps the strict nonce + strict-dynamic policy below.
        [
          "'self'",
          `'nonce-${nonce}'`,
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://js.stripe.com',
        ]
      : [
          "'self'",
          `'nonce-${nonce}'`,
          "'strict-dynamic'",
          // Modern browsers honour `strict-dynamic` and ignore the host-list;
          // older browsers fall back to the host-list so Stripe still loads.
          'https://js.stripe.com',
        ]
    : [
        "'self'",
        "'unsafe-inline'",
        ...(isDevelopment ? ["'unsafe-eval'"] : []),
        'https://js.stripe.com',
      ]

  // style-src: inline styles are much lower risk than inline scripts
  // (CSS is side-effect free in modern browsers). React / styled-jsx /
  // Tailwind emit them; nonce'ing every one is impractical. Keep
  // `'unsafe-inline'` here intentionally — the XSS-critical directive is
  // script-src, which is now strict.
  const styleSrc = ["'self'", "'unsafe-inline'"]

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `script-src ${scriptSrc.join(' ')}`,
    `style-src ${styleSrc.join(' ')}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    `connect-src 'self'${isDevelopment ? ' ws: wss:' : ''} https://api.stripe.com https://js.stripe.com`,
    "object-src 'none'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
  ]

  if (shouldEnforceHttpsHeaders()) {
    directives.push('upgrade-insecure-requests')
  }

  return directives.join('; ')
}

/**
 * Security headers that are safe to set statically (do not need a
 * per-request value). CSP lives in `src/proxy.ts` so it can carry a
 * per-request nonce.
 */
export function getSecurityHeaders(): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-XSS-Protection', value: '1; mode=block' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ]

  if (shouldEnforceHttpsHeaders()) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    })
  }

  return headers
}
