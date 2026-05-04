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
  //
  // HU9 (#1250): we considered tightening with `style-src-attr 'none'`
  // to block the `style="..."` attribute form (inline styles on
  // individual elements, distinct from `<style>` tags). The audit at
  // `docs/audits/style-src-attr-inventory.md` found 14 unavoidable
  // runtime-dynamic uses — drag transforms, viewport-aware `env()`
  // padding, FloatingUI output, anti-FOUC theme bootstrap, percentage
  // bars from DB values — none of which migrate cleanly to Tailwind
  // classes. Decision: keep `style-src-attr` un-restricted; revisit
  // when those categories are gone.
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
    //
    // HU8 (#1249): cloudinary.com + uploadthing.com removed after the audit
    // (scripts/audit-img-src-usage.ts) showed 0 references in any of
    // User.image / Vendor.{logo,coverImage} / Category.{icon,image} /
    // Product.images on dev — and zero infrastructure (no API keys, no
    // upload code paths) wired to either provider. *.public.blob.vercel-storage.com
    // stays because src/lib/blob-storage.ts still treats Vercel Blob as a
    // first-class backend when BLOB_READ_WRITE_TOKEN is set, and incident
    // attachments are scoped to that hostname (src/shared/types/incidents.ts).
    "img-src 'self' data: blob:" +
      ' https://images.unsplash.com' +
      ' https://*.public.blob.vercel-storage.com',
    "font-src 'self' data:",
    // HU3 (#1244): Stripe Radar embeds an iframe from m.stripe.network for
    // device fingerprint. hooks.stripe.com is the webhook *delivery* URL —
    // never embedded in the browser, so it does not belong in frame-src.
    "frame-src 'self' https://js.stripe.com https://m.stripe.network",
    // connect-src allowlist:
    //   - Stripe: api.stripe.com + js.stripe.com for payment intents and SDK
    //     telemetry. r.stripe.com / m.stripe.com / m.stripe.network are
    //     Radar fingerprint + risk-scoring beacons (HU3 #1244): without them
    //     Stripe Elements posts get blocked silently and Radar loses signal,
    //     raising false-positive fraud rates on legitimate payments.
    //   - PostHog EU: NEXT_PUBLIC_POSTHOG_HOST defaults to https://eu.i.posthog.com
    //     (src/lib/posthog.ts:15). The wildcard `https://*.posthog.com` covers
    //     EU + US + the asset CDN PostHog occasionally rotates to. The SDK is
    //     bundled (npm dep), so script-src does NOT need a posthog entry.
    //     If posthog hosting moves to a non-posthog.com domain in the future,
    //     update both this entry and src/lib/posthog.ts:15 in lockstep.
    //   - Sentry: error envelopes go to <project>.ingest.<region>.sentry.io
    //     (e.g. o4511336032370688.ingest.de.sentry.io for the EU region).
    //     The wildcard `https://*.sentry.io` covers all regional ingest
    //     subdomains so a future region change does not need a CSP edit.
    //     The SDK itself is bundled via instrumentation-client.ts (#1323),
    //     so script-src does NOT need a sentry entry. The 4-route smoke
    //     (#1319) caught this missing entry on 2026-05-05 by detecting
    //     CSP `connect-src` violations after Sentry init started firing.
    `connect-src 'self'${isDevelopment ? ' ws: wss:' : ''} https://api.stripe.com https://js.stripe.com https://m.stripe.network https://m.stripe.com https://r.stripe.com https://*.posthog.com https://*.sentry.io`,
    "object-src 'none'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    // HU7 (#1248): browsers POST violation reports to /api/csp-report,
    // which forwards each event to PostHog as `security.csp.violation`.
    // Without this directive a future "tighten the CSP" PR is flying
    // blind — we would only learn about regressions from user
    // complaints. `report-uri` is the legacy directive (Chrome/Edge
    // still honour it); `report-to` is the modern Reporting-API form
    // and uses the `Report-To` HTTP header (see getReportToHeaderValue
    // below). Keep both for full coverage.
    'report-uri /api/csp-report',
    'report-to csp-endpoint',
  ]

  if (shouldEnforceHttpsHeaders()) {
    directives.push('upgrade-insecure-requests')
  }

  return directives.join('; ')
}

/**
 * Reporting-API group descriptor advertised in the `Report-To` HTTP
 * header. Browsers POST violation reports for every reported policy
 * (CSP, COOP, COEP, NEL, etc.) to the URL listed in the matching
 * group.
 *
 * #1248: paired with `report-to csp-endpoint` directive in the CSP.
 *
 * `max_age` is in seconds (126 days here); browsers cache the
 * configuration for that long without re-fetching.
 */
export function getReportToHeaderValue(): string {
  return JSON.stringify({
    group: 'csp-endpoint',
    max_age: 10_886_400,
    endpoints: [{ url: '/api/csp-report' }],
  })
}

// HU2 (#1243): explicit allow/deny for every Permissions-Policy directive
// the browser knows about. Default-deny keeps third-party iframes (Stripe
// in particular) from silently activating sensors or ambient APIs.
//
// CRITICAL: `payment` and `encrypted-media` MUST allowlist `https://js.stripe.com`,
// otherwise Stripe Elements cannot trigger payment confirmation.
// `publickey-credentials-get=(self)` keeps WebAuthn doors open for the
// future TOTP-replacement work without enabling it cross-origin.
const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'ambient-light-sensor=()',
  'autoplay=(self)',
  'battery=()',
  'camera=()',
  'display-capture=()',
  'document-domain=()',
  'encrypted-media=(self "https://js.stripe.com")',
  'fullscreen=(self)',
  'gamepad=()',
  'geolocation=()',
  'gyroscope=()',
  'hid=()',
  'idle-detection=()',
  'interest-cohort=()',
  'keyboard-map=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'navigation-override=()',
  'payment=(self "https://js.stripe.com")',
  'picture-in-picture=()',
  'publickey-credentials-get=(self)',
  'screen-wake-lock=()',
  'serial=()',
  'sync-xhr=(self)',
  'usb=()',
  'web-share=(self)',
  'xr-spatial-tracking=()',
  'browsing-topics=()',
  'attribution-reporting=()',
].join(', ')

/**
 * Security headers that are safe to set statically (do not need a
 * per-request value). CSP lives in `src/proxy.ts` so it can carry a
 * per-request nonce.
 */
export function getSecurityHeaders(): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // X-Frame-Options is redundant with `frame-ancestors 'none'` in the CSP
    // for modern browsers, but kept as defense in depth for older clients.
    { key: 'X-Frame-Options', value: 'DENY' },
    // HU4 (#1245): X-XSS-Protection removed. Header is deprecated; modern
    // browsers ignore it and legacy Safari can be tricked into reflective
    // XSS via the filter (CSP is the canonical defense now).
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
    // HU5 (#1246): COOP must be `same-origin-allow-popups` (NOT `same-origin`)
    // so the Google OAuth popup and Telegram deeplinks survive — `same-origin`
    // would null out window.opener for any cross-origin navigation we trigger.
    //
    // Cross-Origin-Resource-Policy intentionally NOT set here: a global
    // `same-origin` value would break Open Graph previews (Twitter / Facebook /
    // WhatsApp fetch /_next/image cross-origin when a producer / product link
    // gets shared). Per-path CORP (e.g. `same-origin` on /api/*, default on
    // public images) belongs in its own HU.
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
    // HU7 (#1248): Reporting-API group for CSP violation reports.
    // Mirrors `report-to csp-endpoint` in the CSP. Without this header
    // modern browsers ignore the `report-to` directive and only fall
    // back to the legacy `report-uri`.
    { key: 'Report-To', value: getReportToHeaderValue() },
  ]

  if (shouldEnforceHttpsHeaders()) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    })
  }

  return headers
}
