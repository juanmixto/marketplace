import test from 'node:test'
import assert from 'node:assert/strict'
import type { NextRequest } from 'next/server'
import { createLoginRedirectUrl, isOriginAllowed } from '@/proxy'
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

// ---------------------------------------------------------------------------
// CSRF Origin allow-list (proxy.isOriginAllowed). Behind reverse proxies /
// tunnels (Cloudflare Tunnel → dev.feldescloud.com terminates TLS and
// forwards plain http://localhost:3001), the browser-sent Origin host
// (dev.feldescloud.com) won't equal `new URL(request.url).host`
// (localhost:3001). The allow-list must accept Host / X-Forwarded-Host
// and the configured AUTH_URL / NEXT_PUBLIC_APP_URL so that legitimate
// same-origin POSTs (e.g. /api/admin/2fa/enroll) aren't rejected with
// `forbidden_origin`.
// ---------------------------------------------------------------------------

function makeRequest(opts: {
  url: string
  origin?: string | null
  referer?: string | null
  host?: string | null
  forwardedHost?: string | null
}): NextRequest {
  const map = new Map<string, string>()
  if (opts.origin) map.set('origin', opts.origin)
  if (opts.referer) map.set('referer', opts.referer)
  if (opts.host) map.set('host', opts.host)
  if (opts.forwardedHost) map.set('x-forwarded-host', opts.forwardedHost)
  return {
    url: opts.url,
    headers: { get: (name: string) => map.get(name.toLowerCase()) ?? null },
  } as unknown as NextRequest
}

test('isOriginAllowed accepts same-origin POST when request.url matches Origin', () => {
  const request = makeRequest({
    url: 'https://example.com/api/x',
    origin: 'https://example.com',
  })
  assert.equal(isOriginAllowed(request), true)
})

test('isOriginAllowed accepts Origin matching the forwarded Host header behind a tunnel', () => {
  // Cloudflare Tunnel: TLS terminated at edge, forwarded to localhost.
  const request = makeRequest({
    url: 'http://localhost:3001/api/admin/2fa/enroll',
    origin: 'https://dev.feldescloud.com',
    host: 'dev.feldescloud.com',
  })
  assert.equal(isOriginAllowed(request), true)
})

test('isOriginAllowed accepts Origin matching X-Forwarded-Host', () => {
  const request = makeRequest({
    url: 'http://localhost:3001/api/x',
    origin: 'https://app.example.com',
    forwardedHost: 'app.example.com',
  })
  assert.equal(isOriginAllowed(request), true)
})

test('isOriginAllowed accepts Origin matching AUTH_URL when forwarded headers are absent', () => {
  const original = process.env.AUTH_URL
  process.env.AUTH_URL = 'https://dev.feldescloud.com'
  try {
    const request = makeRequest({
      url: 'http://localhost:3001/api/admin/2fa/enroll',
      origin: 'https://dev.feldescloud.com',
    })
    assert.equal(isOriginAllowed(request), true)
  } finally {
    if (original === undefined) delete process.env.AUTH_URL
    else process.env.AUTH_URL = original
  }
})

test('isOriginAllowed rejects cross-site POST from an unrelated origin', () => {
  const original = process.env.AUTH_URL
  process.env.AUTH_URL = 'https://dev.feldescloud.com'
  try {
    const request = makeRequest({
      url: 'http://localhost:3001/api/x',
      origin: 'https://evil.example.com',
      host: 'dev.feldescloud.com',
    })
    assert.equal(isOriginAllowed(request), false)
  } finally {
    if (original === undefined) delete process.env.AUTH_URL
    else process.env.AUTH_URL = original
  }
})

test('isOriginAllowed accepts requests without Origin or Referer (non-browser caller)', () => {
  // Server-to-server / curl: SameSite=Lax cookies and the missing Origin
  // mean this is not a browser CSRF target. Webhook routes are exempt
  // upstream; everything else just gets the regular auth check.
  const request = makeRequest({ url: 'http://localhost:3001/api/x' })
  assert.equal(isOriginAllowed(request), true)
})

test('isOriginAllowed falls back to Referer when Origin is missing', () => {
  const request = makeRequest({
    url: 'http://localhost:3001/api/x',
    referer: 'https://dev.feldescloud.com/admin/security/enroll',
    host: 'dev.feldescloud.com',
  })
  assert.equal(isOriginAllowed(request), true)
})
