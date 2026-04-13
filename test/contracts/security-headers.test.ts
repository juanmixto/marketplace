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

  assert.deepEqual(keys, [
    'X-Content-Type-Options',
    'X-Frame-Options',
    'X-XSS-Protection',
    'Referrer-Policy',
    'Permissions-Policy',
    'Content-Security-Policy',
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

test('buildContentSecurityPolicy allows Stripe while denying framing by other origins', () => {
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL
  delete process.env.NEXT_PUBLIC_APP_URL

  const csp = buildContentSecurityPolicy()

  assert.match(csp, /frame-ancestors 'none'/)
  assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/js\.stripe\.com/)
  assert.match(csp, /img-src 'self' data: blob: https:/)
  assert.match(csp, /connect-src 'self' https:\/\/api\.stripe\.com https:\/\/js\.stripe\.com/)
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
  const csp = buildContentSecurityPolicy(true)

  assert.match(csp, /script-src 'self' 'unsafe-inline' 'unsafe-eval' https:\/\/js\.stripe\.com/)
  assert.match(csp, /connect-src 'self' ws: wss: https:\/\/api\.stripe\.com https:\/\/js\.stripe\.com/)
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
