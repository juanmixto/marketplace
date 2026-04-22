import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isSecureAuthDeployment,
  resolveAuthUrl,
  resolvePublicAppUrl,
  validateAuthDeploymentContract,
} from '@/lib/auth-env'

test('resolveAuthUrl prefers AUTH_URL over NEXTAUTH_URL', () => {
  assert.equal(
    resolveAuthUrl({ AUTH_URL: 'https://a.example', NEXTAUTH_URL: 'https://b.example' }),
    'https://a.example',
  )
  assert.equal(
    resolveAuthUrl({ NEXTAUTH_URL: 'https://b.example' }),
    'https://b.example',
  )
  assert.equal(resolveAuthUrl({}), null)
  assert.equal(resolveAuthUrl({ AUTH_URL: '' }), null)
  assert.equal(
    resolveAuthUrl({ AUTH_URL: '', NEXTAUTH_URL: 'https://b.example' }),
    'https://b.example',
    'empty AUTH_URL should fall through to NEXTAUTH_URL',
  )
})

test('resolvePublicAppUrl prefers Vercel production URL over stale localhost env', () => {
  assert.equal(
    resolvePublicAppUrl({
      VERCEL: '1',
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'dev.feldescloud.com',
    }),
    'https://dev.feldescloud.com'
  )
})

test('isSecureAuthDeployment reflects AUTH_URL scheme, not request protocol', () => {
  assert.equal(isSecureAuthDeployment({ AUTH_URL: 'https://prod.example' }), true)
  assert.equal(isSecureAuthDeployment({ AUTH_URL: 'http://localhost:3000' }), false)
  assert.equal(isSecureAuthDeployment({ NEXTAUTH_URL: 'https://prod.example' }), true)
  assert.equal(
    isSecureAuthDeployment({
      VERCEL: '1',
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'dev.feldescloud.com',
    }),
    true
  )
  assert.equal(isSecureAuthDeployment({}), false)
})

test('validateAuthDeploymentContract is a no-op outside production', () => {
  const errors = validateAuthDeploymentContract({ NODE_ENV: 'development' })
  assert.deepEqual(errors, [])
})

test('validateAuthDeploymentContract requires a public URL in production', () => {
  const errors = validateAuthDeploymentContract({ NODE_ENV: 'production' })
  assert.ok(errors.some(e => e.includes('public app URL')))
})

test('validateAuthDeploymentContract accepts Vercel production URL fallback', () => {
  const errors = validateAuthDeploymentContract({
    NODE_ENV: 'production',
    VERCEL: '1',
    VERCEL_ENV: 'production',
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'dev.feldescloud.com',
    AUTH_SECRET: 'x',
  })
  assert.deepEqual(errors, [])
})

test('validateAuthDeploymentContract rejects http:// AUTH_URL in production', () => {
  const errors = validateAuthDeploymentContract({
    NODE_ENV: 'production',
    AUTH_URL: 'http://prod.example',
    AUTH_SECRET: 'x',
  })
  assert.ok(errors.some(e => e.includes('https://')))
})

test('validateAuthDeploymentContract flags AUTH_URL vs NEXT_PUBLIC_APP_URL origin mismatch', () => {
  const errors = validateAuthDeploymentContract({
    NODE_ENV: 'production',
    AUTH_URL: 'https://a.example',
    NEXT_PUBLIC_APP_URL: 'https://b.example',
    AUTH_SECRET: 'x',
  })
  assert.ok(errors.some(e => e.includes('same origin')))
})

test('validateAuthDeploymentContract accepts a consistent production contract', () => {
  const errors = validateAuthDeploymentContract({
    NODE_ENV: 'production',
    AUTH_URL: 'https://prod.example',
    NEXT_PUBLIC_APP_URL: 'https://prod.example',
    AUTH_SECRET: 'x',
  })
  assert.deepEqual(errors, [])
})

test('validateAuthDeploymentContract requires AUTH_SECRET in production', () => {
  const errors = validateAuthDeploymentContract({
    NODE_ENV: 'production',
    AUTH_URL: 'https://prod.example',
  })
  assert.ok(errors.some(e => e.includes('AUTH_SECRET')))
})
