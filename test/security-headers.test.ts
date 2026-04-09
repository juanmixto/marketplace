import test from 'node:test'
import assert from 'node:assert/strict'
import { buildContentSecurityPolicy, getSecurityHeaders } from '@/lib/security-headers'

test('getSecurityHeaders exposes the core browser hardening headers', () => {
  const headers = getSecurityHeaders()
  const keys = headers.map(header => header.key)

  assert.deepEqual(keys, [
    'X-Content-Type-Options',
    'X-Frame-Options',
    'X-XSS-Protection',
    'Referrer-Policy',
    'Permissions-Policy',
    'Strict-Transport-Security',
    'Content-Security-Policy',
  ])
})

test('buildContentSecurityPolicy allows Stripe while denying framing by other origins', () => {
  const csp = buildContentSecurityPolicy()

  assert.match(csp, /frame-ancestors 'none'/)
  assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/js\.stripe\.com/)
  assert.match(csp, /img-src 'self' data: blob: https:/)
  assert.match(csp, /connect-src 'self' https:\/\/api\.stripe\.com https:\/\/js\.stripe\.com/)
})
