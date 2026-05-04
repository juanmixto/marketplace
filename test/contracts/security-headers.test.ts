import test from 'node:test'
import assert from 'node:assert/strict'
import { buildContentSecurityPolicy, getSecurityHeaders } from '@/lib/security-headers'
import nextConfig, { buildHeaderRules } from '../../next.config'

test('getSecurityHeaders exposes the core browser hardening headers', () => {
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL
  const previousAuthUrl = process.env.AUTH_URL
  const previousNextAuthUrl = process.env.NEXTAUTH_URL

  delete process.env.NEXT_PUBLIC_APP_URL
  delete process.env.AUTH_URL
  delete process.env.NEXTAUTH_URL

  const headers = getSecurityHeaders()
  const keys = headers.map(header => header.key)

  // CSP intentionally omitted from static headers — it's emitted per-request
  // by src/proxy.ts so it can carry a fresh nonce (#537).
  // HU4 (#1245): X-XSS-Protection removed (deprecated, can introduce XSS in
  // legacy Safari). HU5 (#1246): Cross-Origin-Opener-Policy added.
  assert.deepEqual(keys, [
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Cross-Origin-Opener-Policy',
    // HU7 (#1248): Report-To group descriptor for the Reporting-API.
    'Report-To',
  ])

  process.env.NEXT_PUBLIC_APP_URL = previousAppUrl
  process.env.AUTH_URL = previousAuthUrl
  process.env.NEXTAUTH_URL = previousNextAuthUrl
})

test('getSecurityHeaders adds HSTS when the app is configured behind HTTPS', () => {
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL
  process.env.NEXT_PUBLIC_APP_URL = 'https://marketplace.example.com'

  const headers = getSecurityHeaders()
  const keys = headers.map(header => header.key)

  assert.ok(keys.includes('Strict-Transport-Security'))

  process.env.NEXT_PUBLIC_APP_URL = previousAppUrl
})

test('buildContentSecurityPolicy with nonce enforces strict script-src (#537)', () => {
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL
  delete process.env.NEXT_PUBLIC_APP_URL

  const csp = buildContentSecurityPolicy({ nonce: 'testnonce123', isDevelopment: false })

  // The audit-critical assertion: no 'unsafe-inline' in script-src.
  assert.doesNotMatch(
    csp,
    /script-src[^;]*'unsafe-inline'/,
    "script-src must NOT include 'unsafe-inline' when a nonce is present"
  )
  assert.match(csp, /script-src [^;]*'nonce-testnonce123'/)
  assert.match(csp, /script-src [^;]*'strict-dynamic'/)
  assert.match(csp, /script-src [^;]*https:\/\/js\.stripe\.com/)
  assert.match(csp, /frame-ancestors 'none'/)
  // img-src is the allowlist of image hosts; must mirror remotePatterns in
  // next.config.ts. Explicitly reject the historical `https:` wildcard so a
  // regression cannot silently widen the policy.
  assert.match(csp, /img-src 'self' data: blob:/)
  assert.match(csp, /img-src [^;]*https:\/\/images\.unsplash\.com/)
  assert.match(csp, /img-src [^;]*https:\/\/\*\.cloudinary\.com/)
  assert.match(csp, /img-src [^;]*https:\/\/\*\.uploadthing\.com/)
  assert.match(csp, /img-src [^;]*https:\/\/\*\.public\.blob\.vercel-storage\.com/)
  assert.doesNotMatch(
    csp,
    /img-src[^;]* https:(?=\s|;|$)/,
    'img-src must not contain a bare `https:` wildcard'
  )
  // HU3 (#1244): Stripe Radar fingerprint hosts must be present in connect-src.
  assert.match(csp, /connect-src 'self' https:\/\/api\.stripe\.com https:\/\/js\.stripe\.com https:\/\/m\.stripe\.network https:\/\/m\.stripe\.com https:\/\/r\.stripe\.com https:\/\/\*\.posthog\.com/)
  // HU3 (#1244): m.stripe.network embeds Radar fingerprint iframe.
  assert.match(csp, /frame-src 'self' https:\/\/js\.stripe\.com https:\/\/m\.stripe\.network/)
  // HU3 (#1244): hooks.stripe.com is webhook delivery, never embedded.
  assert.doesNotMatch(csp, /frame-src[^;]*hooks\.stripe\.com/)
  // HU7 (#1248): browsers must be told where to POST violation reports.
  // Both directives needed: report-uri (legacy — Chrome/Edge still
  // honour it); report-to (modern Reporting-API, paired with the
  // Report-To header).
  assert.match(csp, /report-uri \/api\/csp-report/)
  assert.match(csp, /report-to csp-endpoint/)

  process.env.NEXT_PUBLIC_APP_URL = previousAppUrl
})

test('Report-To header advertises csp-endpoint group at /api/csp-report (#1248)', () => {
  const reportTo = getSecurityHeaders().find((h) => h.key === 'Report-To')
  assert.ok(reportTo, 'Report-To must be present so browsers honour the report-to CSP directive')
  const parsed = JSON.parse(reportTo.value) as {
    group?: string
    max_age?: number
    endpoints?: Array<{ url?: string }>
  }
  assert.equal(parsed.group, 'csp-endpoint')
  assert.equal(parsed.endpoints?.[0]?.url, '/api/csp-report')
  assert.ok(typeof parsed.max_age === 'number' && parsed.max_age > 0)
})

test('buildContentSecurityPolicy without nonce falls back to permissive script-src (test/legacy path)', () => {
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL
  delete process.env.NEXT_PUBLIC_APP_URL

  const csp = buildContentSecurityPolicy()

  // Without a nonce we keep the old behaviour so callers that haven't
  // been migrated still get a working (but weaker) CSP rather than a
  // broken app. Proxy generates a nonce on every real request.
  assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/js\.stripe\.com/)
  assert.match(csp, /frame-ancestors 'none'/)
  assert.doesNotMatch(csp, /upgrade-insecure-requests/)

  process.env.NEXT_PUBLIC_APP_URL = previousAppUrl
})

test('buildContentSecurityPolicy upgrades insecure requests only for HTTPS deployments', () => {
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL
  process.env.NEXT_PUBLIC_APP_URL = 'https://marketplace.example.com'

  const csp = buildContentSecurityPolicy()

  assert.match(csp, /upgrade-insecure-requests/)

  process.env.NEXT_PUBLIC_APP_URL = previousAppUrl
})

test('buildContentSecurityPolicy allows React development tooling requirements in dev mode', () => {
  const csp = buildContentSecurityPolicy({ nonce: 'devnonce', isDevelopment: true })

  // Dev mode intentionally drops strict-dynamic and adds 'unsafe-inline' on
  // script-src. next-themes (and a few other libs) inject early-load inline
  // scripts without a nonce; with strict-dynamic active they get blocked,
  // hydration fails, login forms fall back to native submit, etc.
  // Production keeps the strict nonce + strict-dynamic policy — see the
  // production assertion test for that contract.
  assert.match(csp, /script-src [^;]*'nonce-devnonce'/)
  assert.match(csp, /script-src [^;]*'unsafe-inline'/)
  assert.match(csp, /script-src [^;]*'unsafe-eval'/)
  assert.doesNotMatch(csp, /script-src [^;]*'strict-dynamic'/)
  assert.match(csp, /connect-src 'self' ws: wss: https:\/\/api\.stripe\.com https:\/\/js\.stripe\.com https:\/\/m\.stripe\.network https:\/\/m\.stripe\.com https:\/\/r\.stripe\.com https:\/\/\*\.posthog\.com/)
})

test('buildContentSecurityPolicy keeps strict-dynamic and drops unsafe-inline in production', () => {
  const csp = buildContentSecurityPolicy({ nonce: 'prodnonce', isDevelopment: false })

  assert.match(csp, /script-src [^;]*'nonce-prodnonce'/)
  assert.match(csp, /script-src [^;]*'strict-dynamic'/)
  assert.doesNotMatch(csp, /script-src [^;]*'unsafe-inline'/)
  assert.doesNotMatch(csp, /script-src [^;]*'unsafe-eval'/)
})

test('buildContentSecurityPolicy allows PostHog connections in connect-src (dev + prod)', () => {
  // PostHog runs entirely from npm bundle (script-src does not need a host),
  // but the SDK opens XHR/fetch/sendBeacon to https://eu.i.posthog.com (or
  // https://us.i.posthog.com for US-region projects, plus the asset CDN
  // PostHog rotates to). The allowlist uses a wildcard *.posthog.com to
  // cover all of those without listing each.
  //
  // This test pins the rule explicitly so a future "tighten the CSP" PR
  // doesn't silently drop PostHog and reintroduce the silent-failure class
  // of bug we hit on 2026-05-02 (see #1093 + the CSP-blocked Live events
  // it caused before this PR landed).
  const dev = buildContentSecurityPolicy({ nonce: 'n', isDevelopment: true })
  const prod = buildContentSecurityPolicy({ nonce: 'n', isDevelopment: false })

  assert.match(dev, /connect-src [^;]* https:\/\/\*\.posthog\.com/)
  assert.match(prod, /connect-src [^;]* https:\/\/\*\.posthog\.com/)
  // script-src must NOT list posthog — the SDK is bundled, not CDN-loaded.
  assert.doesNotMatch(dev, /script-src [^;]*posthog\.com/)
  assert.doesNotMatch(prod, /script-src [^;]*posthog\.com/)
})

test('Permissions-Policy allowlists Stripe for payment + encrypted-media (HU2 #1243)', () => {
  // CRITICAL: payment=() with no allowlist breaks Stripe Elements at the
  // confirmation step. The allowlist for Stripe MUST include js.stripe.com.
  const headers = getSecurityHeaders()
  const policy = headers.find(h => h.key === 'Permissions-Policy')?.value ?? ''

  assert.match(policy, /payment=\(self "https:\/\/js\.stripe\.com"\)/)
  assert.match(policy, /encrypted-media=\(self "https:\/\/js\.stripe\.com"\)/)
  // Sensitive APIs are explicitly denied.
  assert.match(policy, /camera=\(\)/)
  assert.match(policy, /microphone=\(\)/)
  assert.match(policy, /geolocation=\(\)/)
  assert.match(policy, /usb=\(\)/)
  assert.match(policy, /serial=\(\)/)
  assert.match(policy, /hid=\(\)/)
  // Privacy-sensitive proposed APIs are denied.
  assert.match(policy, /interest-cohort=\(\)/)
  assert.match(policy, /browsing-topics=\(\)/)
  assert.match(policy, /attribution-reporting=\(\)/)
})

test('Cross-Origin-Opener-Policy allows OAuth popups (HU5 #1246)', () => {
  // `same-origin` would null out window.opener for the Google OAuth popup
  // and break the Telegram deeplink flow. `same-origin-allow-popups` is
  // the value that keeps both flows working while still isolating
  // top-level browsing context from cross-origin pages.
  const headers = getSecurityHeaders()
  const coop = headers.find(h => h.key === 'Cross-Origin-Opener-Policy')?.value
  assert.equal(coop, 'same-origin-allow-popups')
})

test('X-XSS-Protection has been removed (HU4 #1245)', () => {
  // Header is deprecated; modern browsers ignore it and legacy Safari can
  // be tricked into reflective XSS via the filter. CSP is the canonical
  // defense — the static header is now harmful, not protective.
  const headers = getSecurityHeaders()
  const keys = headers.map(h => h.key)
  assert.ok(!keys.includes('X-XSS-Protection'), 'X-XSS-Protection must NOT be set')
})

test('buildHeaderRules forces /_next/static no-store during development', () => {
  const headers = buildHeaderRules(true)

  assert.ok(headers.some(rule => rule.source === '/:path*'))
  // Dev must override the default Next cache for /_next/static/* with
  // no-store so phones don't keep yesterday's recompiled chunk. The
  // /_next/image rule stays disabled in dev.
  const nextStatic = headers.find(rule => rule.source === '/_next/static/:path*')
  assert.ok(nextStatic, 'expected a /_next/static/:path* rule in development')
  assert.match(
    nextStatic.headers.find(h => h.key === 'Cache-Control')?.value ?? '',
    /no-store/,
    'dev /_next/static rule must use no-store',
  )
  assert.ok(headers.every(rule => rule.source !== '/_next/image'))
})

test('buildHeaderRules keeps asset cache overrides outside development', async () => {
  const headers = buildHeaderRules(false)
  const resolvedHeaders = await nextConfig.headers?.()

  assert.ok(resolvedHeaders)
  assert.ok(headers.some(rule => rule.source === '/_next/static/:path*'))
  assert.ok(headers.some(rule => rule.source === '/_next/image'))
})
