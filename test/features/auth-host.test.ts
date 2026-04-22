import test from 'node:test'
import assert from 'node:assert/strict'
import { applyNormalizedAuthHostEnv, normalizeAuthHostEnv, reqWithHostHeader, shouldUseDynamicAuthUrl } from '@/lib/auth-host'

test('shouldUseDynamicAuthUrl is true in development when AUTH_URL points to localhost', () => {
  assert.equal(
    shouldUseDynamicAuthUrl({
      NODE_ENV: 'development',
      AUTH_URL: 'http://localhost:3000',
    }),
    true
  )
})

test('shouldUseDynamicAuthUrl is false in production', () => {
  assert.equal(
    shouldUseDynamicAuthUrl({
      NODE_ENV: 'production',
      AUTH_URL: 'http://localhost:3000',
    }),
    false
  )
})

test('normalizeAuthHostEnv removes localhost auth url in development', () => {
  const env = normalizeAuthHostEnv({
    NODE_ENV: 'development',
    AUTH_URL: 'http://localhost:3000',
    AUTH_SECRET: 'secret',
  })

  assert.equal('AUTH_URL' in env, false)
  assert.equal(env.AUTH_SECRET, 'secret')
})

test('normalizeAuthHostEnv removes private-network auth urls in development', () => {
  const env = normalizeAuthHostEnv({
    NODE_ENV: 'development',
    AUTH_URL: 'http://192.168.1.76:3004',
    AUTH_SECRET: 'secret',
  })

  assert.equal('AUTH_URL' in env, false)
  assert.equal(env.AUTH_SECRET, 'secret')
})

test('normalizeAuthHostEnv drops dev auth urls even when NEXT_PUBLIC_APP_URL is localhost', () => {
  // Both AUTH_URL and NEXT_PUBLIC_APP_URL can be stale in dev when the port
  // drifts. Deleting them lets Auth.js resolve via `trustHost` + request host.
  const env = normalizeAuthHostEnv({
    NODE_ENV: 'development',
    AUTH_URL: 'http://192.168.1.76:3004',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  })

  assert.equal('AUTH_URL' in env, false)
  assert.equal('NEXTAUTH_URL' in env, false)
})

test('normalizeAuthHostEnv still prefers an external NEXT_PUBLIC_APP_URL', () => {
  const env = normalizeAuthHostEnv({
    NODE_ENV: 'development',
    AUTH_URL: 'http://localhost:3000',
    NEXT_PUBLIC_APP_URL: 'https://preview.example.com',
  })

  assert.equal(env.AUTH_URL, 'https://preview.example.com')
  assert.equal(env.NEXTAUTH_URL, 'https://preview.example.com')
})

test('normalizeAuthHostEnv keeps external auth url intact', () => {
  const env = normalizeAuthHostEnv({
    NODE_ENV: 'development',
    AUTH_URL: 'https://keywords-union-viruses-loc.trycloudflare.com',
  })

  assert.equal(env.AUTH_URL, 'https://keywords-union-viruses-loc.trycloudflare.com')
})

test('shouldUseDynamicAuthUrl also honors NEXTAUTH_URL when AUTH_URL is missing', () => {
  assert.equal(
    shouldUseDynamicAuthUrl({
      NODE_ENV: 'development',
      NEXTAUTH_URL: 'http://localhost:3000',
    }),
    true
  )
})

test('applyNormalizedAuthHostEnv removes localhost auth urls from process env', () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'development',
    AUTH_URL: 'http://localhost:3000',
    NEXTAUTH_URL: 'http://localhost:3000',
    AUTH_SECRET: 'secret',
  }

  applyNormalizedAuthHostEnv(env)

  assert.equal('AUTH_URL' in env, false)
  assert.equal('NEXTAUTH_URL' in env, false)
  assert.equal(env.AUTH_SECRET, 'secret')
})

test('reqWithHostHeader prefers the public https origin when host matches and x-forwarded-proto is absent', () => {
  const previousAuthUrl = process.env.AUTH_URL
  const previousNextPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL

  delete process.env.AUTH_URL
  process.env.NEXT_PUBLIC_APP_URL = 'https://dev.feldescloud.com'

  try {
    const req = new Request('http://localhost:3001/api/auth/session', {
      headers: {
        host: 'dev.feldescloud.com',
      },
    })
    const nextReq = reqWithHostHeader(req)
    assert.equal(new URL(nextReq.url).protocol, 'https:')
    assert.equal(new URL(nextReq.url).hostname, 'dev.feldescloud.com')
  } finally {
    if (previousAuthUrl === undefined) delete process.env.AUTH_URL
    else process.env.AUTH_URL = previousAuthUrl
    if (previousNextPublicAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = previousNextPublicAppUrl
  }
})
