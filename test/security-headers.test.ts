import test from 'node:test'
import assert from 'node:assert/strict'
import { buildContentSecurityPolicy, getSecurityHeaders } from '@/lib/security-headers'

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
