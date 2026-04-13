import test from 'node:test'
import assert from 'node:assert/strict'
import { createLoginRedirectUrl } from '@/proxy'

test('createLoginRedirectUrl preserves the full protected path including query string', () => {
  const request = {
    url: 'https://marketplace.example.com/checkout/pago?orderId=order_123&secret=secret_456',
    nextUrl: new URL('https://marketplace.example.com/checkout/pago?orderId=order_123&secret=secret_456'),
  } as Parameters<typeof createLoginRedirectUrl>[0]

  const loginUrl = createLoginRedirectUrl(request)

  assert.equal(loginUrl.pathname, '/login')
  assert.equal(loginUrl.searchParams.get('callbackUrl'), '/checkout/pago?orderId=order_123&secret=secret_456')
})
