import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAuthHostEnv, shouldUseDynamicAuthUrl } from '@/lib/auth-host'

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

test('normalizeAuthHostEnv keeps external auth url intact', () => {
  const env = normalizeAuthHostEnv({
    NODE_ENV: 'development',
    AUTH_URL: 'https://keywords-union-viruses-loc.trycloudflare.com',
  })

  assert.equal(env.AUTH_URL, 'https://keywords-union-viruses-loc.trycloudflare.com')
})
