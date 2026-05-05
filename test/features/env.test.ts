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

// ─── P0-4 (#1181): PAYMENT_PROVIDER guard not gated by NEXT_PHASE ──────

test('parseServerEnv rejects PAYMENT_PROVIDER=mock when APP_ENV=production', () => {
  assert.throws(
    () =>
      parseServerEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
        NODE_ENV: 'test',
        APP_ENV: 'production',
        PAYMENT_PROVIDER: 'mock',
      }),
    /PAYMENT_PROVIDER must be "stripe" in APP_ENV=production/,
  )
})

test('parseServerEnv rejects sk_test_ key when APP_ENV=production', () => {
  assert.throws(
    () =>
      parseServerEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
        NODE_ENV: 'test',
        APP_ENV: 'production',
        PAYMENT_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_test_123',
        STRIPE_WEBHOOK_SECRET: 'whsec_123',
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_123',
        CRON_SECRET: 'rotated',
      }),
    /STRIPE_SECRET_KEY to start with "sk_live_"/,
  )
})

test('parseServerEnv rejects pk_test_ key when APP_ENV=production', () => {
  assert.throws(
    () =>
      parseServerEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
        NODE_ENV: 'test',
        APP_ENV: 'production',
        PAYMENT_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_live_123',
        STRIPE_WEBHOOK_SECRET: 'whsec_123',
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
        CRON_SECRET: 'rotated',
      }),
    /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to start with "pk_live_"/,
  )
})

test('parseServerEnv accepts a valid prod-shaped config', () => {
  const env = parseServerEnv({
    DATABASE_URL: 'postgresql://user:pass@db.internal:5432/marketplace',
    NODE_ENV: 'test',
    APP_ENV: 'production',
    PAYMENT_PROVIDER: 'stripe',
    STRIPE_SECRET_KEY: 'sk_live_123',
    STRIPE_WEBHOOK_SECRET: 'whsec_123',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_123',
    CRON_SECRET: 'rotated',
    NEXT_PUBLIC_APP_URL: 'https://raizdirecta.es',
  })
  assert.equal(env.appEnv, 'production')
  assert.equal(env.paymentProvider, 'stripe')
})

// ─── P0-5 (#1182): FEATURE_FLAGS_OVERRIDE forbidden in prod ────────────

test('parseServerEnv rejects FEATURE_FLAGS_OVERRIDE in APP_ENV=production', () => {
  assert.throws(
    () =>
      parseServerEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
        NODE_ENV: 'test',
        APP_ENV: 'production',
        PAYMENT_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_live_123',
        STRIPE_WEBHOOK_SECRET: 'whsec_123',
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_123',
        CRON_SECRET: 'rotated',
        FEATURE_FLAGS_OVERRIDE: '{"kill-checkout":false}',
      }),
    /FEATURE_FLAGS_OVERRIDE is forbidden in APP_ENV=production/,
  )
})

test('parseServerEnv rejects NEXT_PUBLIC_FEATURE_FLAGS_OVERRIDE in APP_ENV=production', () => {
  assert.throws(
    () =>
      parseServerEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
        NODE_ENV: 'test',
        APP_ENV: 'production',
        PAYMENT_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_live_123',
        STRIPE_WEBHOOK_SECRET: 'whsec_123',
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_123',
        CRON_SECRET: 'rotated',
        NEXT_PUBLIC_FEATURE_FLAGS_OVERRIDE: '{"kill-auth-social":false}',
      }),
    /NEXT_PUBLIC_FEATURE_FLAGS_OVERRIDE is forbidden in APP_ENV=production/,
  )
})

test('parseServerEnv accepts FEATURE_FLAGS_OVERRIDE in APP_ENV=development', () => {
  const env = parseServerEnv({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
    NODE_ENV: 'test',
    APP_ENV: 'development',
    PAYMENT_PROVIDER: 'mock',
    FEATURE_FLAGS_OVERRIDE: '{"kill-checkout":false}',
  })
  assert.equal(env.featureFlagsOverrideRaw, '{"kill-checkout":false}')
})

// ─── P0-5 cont.: dev-only convenience flags forbidden in prod ──────────

test('parseServerEnv rejects DISABLE_LOGIN_RATELIMIT=1 in APP_ENV=production', () => {
  assert.throws(
    () =>
      parseServerEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
        NODE_ENV: 'test',
        APP_ENV: 'production',
        PAYMENT_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_live_123',
        STRIPE_WEBHOOK_SECRET: 'whsec_123',
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_123',
        CRON_SECRET: 'rotated',
        DISABLE_LOGIN_RATELIMIT: '1',
      }),
    /DISABLE_LOGIN_RATELIMIT=1 is forbidden in APP_ENV=production/,
  )
})

test('parseServerEnv rejects MOCK_OAUTH_ENABLED in APP_ENV=production', () => {
  assert.throws(
    () =>
      parseServerEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
        NODE_ENV: 'test',
        APP_ENV: 'production',
        PAYMENT_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_live_123',
        STRIPE_WEBHOOK_SECRET: 'whsec_123',
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_123',
        CRON_SECRET: 'rotated',
        MOCK_OAUTH_ENABLED: 'true',
      }),
    /MOCK_OAUTH_ENABLED is forbidden in APP_ENV=production/,
  )
})

test('parseServerEnv requires CRON_SECRET in APP_ENV=production', () => {
  assert.throws(
    () =>
      parseServerEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
        NODE_ENV: 'test',
        APP_ENV: 'production',
        PAYMENT_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_live_123',
        STRIPE_WEBHOOK_SECRET: 'whsec_123',
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_123',
      }),
    /CRON_SECRET is required in APP_ENV=production/,
  )
})

// ─── P1-3: orphan env validation refines ───────────────────────────────

test('parseServerEnv rejects partial Telegram bot config', () => {
  assert.throws(
    () =>
      parseServerEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
        NODE_ENV: 'test',
        TELEGRAM_BOT_TOKEN: '123:abc',
      }),
    /Telegram bot requires all of/,
  )
})

test('parseServerEnv accepts complete Telegram bot trio', () => {
  const env = parseServerEnv({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
    NODE_ENV: 'test',
    TELEGRAM_BOT_TOKEN: '123:abc',
    TELEGRAM_WEBHOOK_SECRET: 'sec',
    TELEGRAM_BOT_USERNAME: 'foo_bot',
  })
  assert.equal(env.appEnv, 'development')
})

test('parseServerEnv rejects partial VAPID pair', () => {
  assert.throws(
    () =>
      parseServerEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
        NODE_ENV: 'test',
        VAPID_PRIVATE_KEY: 'priv',
      }),
    /VAPID push requires both/,
  )
})

test('parseServerEnv rejects partial Telegram sidecar', () => {
  assert.throws(
    () =>
      parseServerEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
        NODE_ENV: 'test',
        TELEGRAM_SIDECAR_URL: 'http://127.0.0.1:8088',
      }),
    /Telegram sidecar requires both/,
  )
})

test('parseServerEnv accepts empty Sentry DSN strings (build-arg default)', () => {
  // docker-compose passes `${NEXT_PUBLIC_SENTRY_DSN:-}` so unset DSNs reach
  // `next build` as "" rather than undefined. zod's `.url().optional()` rejects
  // empty strings, which crashed the build pipeline (#1322 regression).
  assert.doesNotThrow(() =>
    parseServerEnv({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
      NODE_ENV: 'test',
      PAYMENT_PROVIDER: 'mock',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      SENTRY_DSN: '',
      NEXT_PUBLIC_SENTRY_DSN: '',
    }),
  )
})

test('parseServerEnv rejects partial Google OAuth pair', () => {
  assert.throws(
    () =>
      parseServerEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
        NODE_ENV: 'test',
        AUTH_GOOGLE_ID: 'client.apps.googleusercontent.com',
      }),
    /Google OAuth requires both/,
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
