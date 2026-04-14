import test from 'node:test'
import assert from 'node:assert/strict'
import { createLoginRedirectUrl } from '@/proxy'
import { hostMatchesAdmin, isRequestOnAdminHost, ADMIN_HOST_ENV_VAR } from '@/lib/admin-host'

test('createLoginRedirectUrl preserves the full protected path including query string', () => {
  const request = {
    url: 'https://marketplace.example.com/checkout/pago?orderId=order_123&secret=secret_456',
    nextUrl: new URL('https://marketplace.example.com/checkout/pago?orderId=order_123&secret=secret_456'),
  } as Parameters<typeof createLoginRedirectUrl>[0]

  const loginUrl = createLoginRedirectUrl(request)

  assert.equal(loginUrl.pathname, '/login')
  assert.equal(loginUrl.searchParams.get('callbackUrl'), '/checkout/pago?orderId=order_123&secret=secret_456')
})

test('createLoginRedirectUrl drops unsafe callback candidates instead of forwarding them', () => {
  // This should never happen in practice (the request path is server-produced),
  // but the middleware must still not launder an unsafe value into /login.
  const request = {
    url: 'https://marketplace.example.com/%5cevil.example.com',
    nextUrl: new URL('https://marketplace.example.com/%5cevil.example.com'),
  } as Parameters<typeof createLoginRedirectUrl>[0]

  const loginUrl = createLoginRedirectUrl(request)

  assert.equal(loginUrl.pathname, '/login')
  // callbackUrl is intentionally absent — the unsafe path was dropped.
  assert.equal(loginUrl.searchParams.get('callbackUrl'), null)
})

// ---------------------------------------------------------------------------
// Admin host isolation (ticket #348).
// ---------------------------------------------------------------------------

test('hostMatchesAdmin is case-insensitive and ignores port', () => {
  assert.equal(hostMatchesAdmin('admin.example.com', 'admin.example.com'), true)
  assert.equal(hostMatchesAdmin('Admin.Example.Com', 'admin.example.com'), true)
  assert.equal(hostMatchesAdmin('admin.example.com:3000', 'admin.example.com'), true)
  assert.equal(hostMatchesAdmin('admin.example.com', 'admin.example.com:3000'), true)
})

test('hostMatchesAdmin rejects sibling and parent hosts', () => {
  assert.equal(hostMatchesAdmin('example.com', 'admin.example.com'), false)
  assert.equal(hostMatchesAdmin('www.example.com', 'admin.example.com'), false)
  assert.equal(hostMatchesAdmin('evil-admin.example.com', 'admin.example.com'), false)
  assert.equal(hostMatchesAdmin('admin.example.com.evil.com', 'admin.example.com'), false)
})

test('hostMatchesAdmin returns false when either argument is missing', () => {
  assert.equal(hostMatchesAdmin(null, 'admin.example.com'), false)
  assert.equal(hostMatchesAdmin('admin.example.com', undefined), false)
  assert.equal(hostMatchesAdmin(undefined, undefined), false)
})

test('isRequestOnAdminHost short-circuits when ADMIN_HOST is unset', () => {
  const originalValue = process.env[ADMIN_HOST_ENV_VAR]
  delete process.env[ADMIN_HOST_ENV_VAR]
  try {
    const request = {
      headers: {
        get: (name: string) => (name === 'host' ? 'admin.example.com' : null),
      },
    }
    assert.equal(isRequestOnAdminHost(request), false)
  } finally {
    if (originalValue !== undefined) process.env[ADMIN_HOST_ENV_VAR] = originalValue
  }
})

test('isRequestOnAdminHost uses host header, falls back to x-forwarded-host', () => {
  const originalValue = process.env[ADMIN_HOST_ENV_VAR]
  process.env[ADMIN_HOST_ENV_VAR] = 'admin.example.com'
  try {
    const direct = {
      headers: {
        get: (name: string) => (name === 'host' ? 'admin.example.com' : null),
      },
    }
    assert.equal(isRequestOnAdminHost(direct), true)

    const viaProxy = {
      headers: {
        get: (name: string) => (name === 'x-forwarded-host' ? 'admin.example.com' : null),
      },
    }
    assert.equal(isRequestOnAdminHost(viaProxy), true)

    const publicHost = {
      headers: {
        get: (name: string) => (name === 'host' ? 'www.example.com' : null),
      },
    }
    assert.equal(isRequestOnAdminHost(publicHost), false)
  } finally {
    if (originalValue === undefined) delete process.env[ADMIN_HOST_ENV_VAR]
    else process.env[ADMIN_HOST_ENV_VAR] = originalValue
  }
})
