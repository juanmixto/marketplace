export interface SecurityHeader {
  key: string
  value: string
}

function shouldEnforceHttpsHeaders() {
  const candidateUrls = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
  ].filter((value): value is string => Boolean(value))

  return candidateUrls.some(value => {
    try {
      return new URL(value).protocol === 'https:'
    } catch {
      return false
    }
  })
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
    // img-src is the allowlist of every host user-generated or optimizer-bypass
    // raw <img> tags may load from. Next.js-optimized images always resolve to
    // `'self'` (they go through /_next/image), so only code paths that render
    // external URLs directly (vendor hero/logo, blob storage previews) need
    // explicit hosts. Keep this in lockstep with `remotePatterns` in
    // `next.config.ts` — a generic `https:` opens img-sink XSS vectors
    // (malicious SVG, cookieless beacon images) for no real benefit.
    "img-src 'self' data: blob:" +
      ' https://images.unsplash.com' +
      ' https://*.cloudinary.com' +
      ' https://*.uploadthing.com' +
      ' https://*.public.blob.vercel-storage.com',
    "font-src 'self' data:",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    // connect-src allowlist:
    //   - Stripe: required for payment intents and JS SDK telemetry.
    //   - PostHog EU: NEXT_PUBLIC_POSTHOG_HOST defaults to https://eu.i.posthog.com
    //     (src/lib/posthog.ts:15). The wildcard `https://*.posthog.com` covers
    //     EU + US + the asset CDN PostHog occasionally rotates to. The SDK is
    //     bundled (npm dep), so script-src does NOT need a posthog entry.
    //     If posthog hosting moves to a non-posthog.com domain in the future,
    //     update both this entry and src/lib/posthog.ts:15 in lockstep.
    `connect-src 'self'${isDevelopment ? ' ws: wss:' : ''} https://api.stripe.com https://js.stripe.com https://*.posthog.com`,
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
