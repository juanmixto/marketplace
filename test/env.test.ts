import test from 'node:test'
import assert from 'node:assert/strict'
import { parseServerEnv } from '@/lib/env'

test('parseServerEnv accepts mock mode without Stripe secrets', () => {
  const env = parseServerEnv({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
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
        PAYMENT_PROVIDER: 'stripe',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      }),
    /Stripe mode requires these env vars/
  )
})

test('parseServerEnv returns normalized stripe config when complete', () => {
  const env = parseServerEnv({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
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
