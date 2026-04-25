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
  assert.deepEqual(keys, [
    'X-Content-Type-Options',
    'X-Frame-Options',
    'X-XSS-Protection',
    'Referrer-Policy',
    'Permissions-Policy',
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
  assert.match(csp, /connect-src 'self' https:\/\/api\.stripe\.com https:\/\/js\.stripe\.com/)

  process.env.NEXT_PUBLIC_APP_URL = previousAppUrl
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
  assert.match(csp, /connect-src 'self' ws: wss: https:\/\/api\.stripe\.com https:\/\/js\.stripe\.com/)
})

test('buildContentSecurityPolicy keeps strict-dynamic and drops unsafe-inline in production', () => {
  const csp = buildContentSecurityPolicy({ nonce: 'prodnonce', isDevelopment: false })

  assert.match(csp, /script-src [^;]*'nonce-prodnonce'/)
  assert.match(csp, /script-src [^;]*'strict-dynamic'/)
  assert.doesNotMatch(csp, /script-src [^;]*'unsafe-inline'/)
  assert.doesNotMatch(csp, /script-src [^;]*'unsafe-eval'/)
})

test('buildHeaderRules skips Next asset cache overrides during development', () => {
  const headers = buildHeaderRules(true)

  assert.ok(headers.some(rule => rule.source === '/:path*'))
  assert.ok(headers.every(rule => rule.source !== '/_next/static/:path*'))
  assert.ok(headers.every(rule => rule.source !== '/_next/image'))
})

test('buildHeaderRules keeps asset cache overrides outside development', async () => {
  const headers = buildHeaderRules(false)
  const resolvedHeaders = await nextConfig.headers?.()

  assert.ok(resolvedHeaders)
  assert.ok(headers.some(rule => rule.source === '/_next/static/:path*'))
  assert.ok(headers.some(rule => rule.source === '/_next/image'))
})
