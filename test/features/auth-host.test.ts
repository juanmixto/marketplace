import test from 'node:test'
import assert from 'node:assert/strict'
import { applyNormalizedAuthHostEnv, normalizeAuthHostEnv, shouldUseDynamicAuthUrl } from '@/lib/auth-host'

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

test('normalizeAuthHostEnv prefers NEXT_PUBLIC_APP_URL when the dev auth host is stale', () => {
  const env = normalizeAuthHostEnv({
    NODE_ENV: 'development',
    AUTH_URL: 'http://192.168.1.76:3004',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  })

  assert.equal(env.AUTH_URL, 'http://localhost:3000')
  assert.equal(env.NEXTAUTH_URL, 'http://localhost:3000')
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
