import test from 'node:test'
import assert from 'node:assert/strict'
import { getServerEnv, parseServerEnv, resetServerEnvCache } from '@/lib/env'

test('parseServerEnv accepts mock mode without Stripe secrets', () => {
  const env = parseServerEnv({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
    NODE_ENV: 'test',
    PAYMENT_PROVIDER: 'mock',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  })

  assert.equal(env.paymentProvider, 'mock')
  assert.equal(env.databaseUrl, 'postgresql://user:pass@localhost:5432/marketplace')
})

test('parseServerEnv requires Stripe variables in stripe mode', () => {
  assert.throws(
    () =>
      parseServerEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
        NODE_ENV: 'test',
        PAYMENT_PROVIDER: 'stripe',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      }),
    /Stripe mode requires these env vars/
  )
})

test('parseServerEnv returns normalized stripe config when complete', () => {
  const env = parseServerEnv({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
    NODE_ENV: 'test',
    PAYMENT_PROVIDER: 'stripe',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET: 'whsec_123',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
  })

  assert.equal(env.paymentProvider, 'stripe')
  assert.equal(env.stripeSecretKey, 'sk_test_123')
  assert.equal(env.stripeWebhookSecret, 'whsec_123')
  assert.equal(env.stripePublishableKey, 'pk_test_123')
})

test('parseServerEnv falls back to localhost app url by default', () => {
  const env = parseServerEnv({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
    NODE_ENV: 'test',
  })

  assert.equal(env.appUrl, 'http://localhost:3000')
  assert.equal(env.paymentProvider, 'mock')
})

test('parseServerEnv prefers the Vercel production URL when running on Vercel', () => {
  const env = parseServerEnv({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
    NODE_ENV: 'production',
    VERCEL: '1',
    VERCEL_ENV: 'production',
    AUTH_SECRET: 'secret',
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'dev.feldescloud.com',
    PAYMENT_PROVIDER: 'stripe',
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET: 'whsec_123',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
  })

  assert.equal(env.appUrl, 'https://dev.feldescloud.com')
  assert.equal(env.authUrl, 'https://dev.feldescloud.com')
})

test('parseServerEnv rejects invalid public app urls', () => {
  assert.throws(
    () =>
      parseServerEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
        NODE_ENV: 'test',
        NEXT_PUBLIC_APP_URL: 'not-a-url',
      }),
    /NEXT_PUBLIC_APP_URL must be a valid URL/
  )
})

test('getServerEnv caches until resetServerEnvCache is called', () => {
  const originalEnv = { ...process.env }

  Object.assign(process.env, {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
    NODE_ENV: 'test',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    PAYMENT_PROVIDER: 'mock',
  })
  resetServerEnvCache()

  const first = getServerEnv()
  process.env.NEXT_PUBLIC_APP_URL = 'https://changed.example.com'
  const second = getServerEnv()

  assert.equal(first.appUrl, 'http://localhost:3000')
  assert.equal(second.appUrl, 'http://localhost:3000')

  resetServerEnvCache()
  const third = getServerEnv()
  assert.equal(third.appUrl, 'https://changed.example.com')

  process.env = originalEnv
  resetServerEnvCache()
})
