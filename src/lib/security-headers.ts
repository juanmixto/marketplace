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
      ' https://*.public.blob.vercel-storage.com' +
      // Google avatars (`session.user.image` from social login). Without
      // this, every signed-in page emits an `img-src` violation and the
      // navbar/profile avatar falls back to initials.
      ' https://lh3.googleusercontent.com',
    "font-src 'self' data:",
    // #1244 (HU3): Stripe Elements iframes its Radar fingerprint widget
    // from `m.stripe.network`; without the entry the iframe is blocked
    // and Radar silently loses fingerprint signal (more false-positive
    // declines on real payments). `hooks.stripe.com` was incorrect here
    // — that endpoint is webhook delivery (server → us), never embedded
    // in an iframe — so it's removed.
    "frame-src 'self' https://js.stripe.com https://m.stripe.network",
    // connect-src allowlist:
    //   - Stripe: required for payment intents and JS SDK telemetry.
    //     #1244 (HU3): also `m.stripe.network`, `m.stripe.com`, and
    //     `r.stripe.com` for Radar fingerprint POSTs. Missing them lets
    //     Stripe block fingerprint silently and degrade fraud scoring.
    //   - PostHog EU: NEXT_PUBLIC_POSTHOG_HOST defaults to https://eu.i.posthog.com
    //     (src/lib/posthog.ts:15). The wildcard `https://*.posthog.com` covers
    //     EU + US + the asset CDN PostHog occasionally rotates to. The SDK is
    //     bundled (npm dep), so script-src does NOT need a posthog entry.
    //     If posthog hosting moves to a non-posthog.com domain in the future,
    //     update both this entry and src/lib/posthog.ts:15 in lockstep.
    `connect-src 'self'${isDevelopment ? ' ws: wss:' : ''} https://api.stripe.com https://js.stripe.com https://m.stripe.network https://m.stripe.com https://r.stripe.com https://*.posthog.com`,
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
 * Permissions-Policy directives, listed one-per-line so a future
 * editor sees the explicit allow / deny per feature instead of hunting
 * through a 600-char string. Joined with ", " into the final header
 * value below — that's the spec-mandated separator for the structured
 * header form.
 *
 * #1243 (HU2): the previous policy left a long tail of sensitive
 * features (usb, hid, payment, browsing-topics, attribution-reporting,
 * etc.) un-restricted, which let an embedded iframe or a compromised
 * subdomain opt itself in. The list below denies everything by
 * default and explicitly allow-lists `self` + Stripe for the few
 * features the app actually uses.
 *
 * CRITICAL — do NOT set `payment=()`. That kills Stripe checkout
 * silently (Elements mounts but submit is a no-op). The
 * `payment=(self "https://js.stripe.com")` entry is load-bearing.
 */
const PERMISSIONS_POLICY_DIRECTIVES = [
  // Sensors / hardware — never used.
  'accelerometer=()',
  'ambient-light-sensor=()',
  'gamepad=()',
  'gyroscope=()',
  'hid=()',
  'magnetometer=()',
  'midi=()',
  'serial=()',
  'usb=()',
  'xr-spatial-tracking=()',
  // Capture / sensors.
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'display-capture=()',
  'idle-detection=()',
  'screen-wake-lock=()',
  // Privacy-affecting browser APIs we explicitly opt out of.
  'browsing-topics=()',
  'attribution-reporting=()',
  'interest-cohort=()',
  // Misc surface-area we never opt into.
  'battery=()',
  'document-domain=()',
  'keyboard-map=()',
  'navigation-override=()',
  'picture-in-picture=()',
  // Allow-listed surfaces the app actually uses.
  'autoplay=(self)',
  'fullscreen=(self)',
  'sync-xhr=(self)',
  'web-share=(self)',
  'publickey-credentials-get=(self)',
  // Stripe Elements requires `payment` and `encrypted-media`. Removing
  // these breaks checkout in a way that's hard to detect (Elements
  // silently fails to mount — the buyer sees the form but submit does
  // nothing). Keep both entries even when refactoring the list.
  'payment=(self "https://js.stripe.com")',
  'encrypted-media=(self "https://js.stripe.com")',
] as const

/**
 * Security headers that are safe to set statically (do not need a
 * per-request value). CSP lives in `src/proxy.ts` so it can carry a
 * per-request nonce.
 */
export function getSecurityHeaders(): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    // #1245 (HU4): X-XSS-Protection is deprecated and counterproductive
    // in legacy Safari (its reflective-XSS filter has documented
    // bypasses that turn it into a CSP-bypass vector). CSP is the
    // modern defense; the header now lives only in git history.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: PERMISSIONS_POLICY_DIRECTIVES.join(', ') },
    // #1246 (HU5): COOP isolates this origin from cross-origin tabs
    // that could otherwise hold a `window.opener` reference.
    // `same-origin-allow-popups` (NOT `same-origin`) is required so
    // OAuth popups (Google login) and the Telegram deeplink window
    // opened from /admin/ingestion/telegram can still post back to us.
    // CORP `same-origin` keeps our assets from being embedded
    // cross-origin without explicit opt-in (defense against
    // Spectre-class cross-origin reads).
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  ]

  if (shouldEnforceHttpsHeaders()) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    })
  }

  return headers
}
