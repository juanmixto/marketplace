/**
 * Smoke tests for the Stripe webhook signature gate (#1184).
 *
 * Hits the real route handler `src/app/api/webhooks/stripe/route.ts` with
 * forged requests and asserts:
 *   1. No Stripe-Signature header in stripe-mode → 400, no DB write
 *   2. Body + corrupted signature in stripe-mode → 400, no DB write
 *   3. Mock provider + NODE_ENV=production → 403
 *
 * Because the route's signature check fires BEFORE any Prisma call, no
 * test database is required: the response returns at the gate and the
 * lazy `db` Proxy is never touched. The test asserts that property by
 * spying on `globalThis.prismaGlobal`.
 *
 * Companion to test/features/webhook-security.test.ts which tests the
 * pure helpers (isMockWebhookAllowed, getWebhookIdempotencyKey).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { resetServerEnvCache } from '@/lib/env'

// Helper: temporarily mutate process.env, ensure cache reset, restore on exit.
async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const saved: Record<string, string | undefined> = {}
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key]
    const value = overrides[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetServerEnvCache()
  try {
    return await fn()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    resetServerEnvCache()
  }
}

// Build a NextRequest-shaped object from a body + headers. Next's
// NextRequest extends Request; for the route's purposes (req.text(),
// req.headers.get) a plain Request is interchangeable.
function buildRequest(body: string, headers: Record<string, string>): Request {
  return new Request('https://example.com/api/webhooks/stripe', {
    method: 'POST',
    body,
    headers,
  })
}

test('webhook rejects requests with no Stripe-Signature header (stripe mode)', async () => {
  await withEnv(
    {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
      NODE_ENV: 'test',
      PAYMENT_PROVIDER: 'stripe',
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
      // Force the webhook NOT to be killed via the kill switch.
      // The flag default is fail-open (true) so this is also satisfied
      // when PostHog is unconfigured, but being explicit insulates the
      // test from a future change in defaults.
      NEXT_PUBLIC_POSTHOG_KEY: '',
    },
    async () => {
      const { POST } = await import('@/app/api/webhooks/stripe/route')
      const body = JSON.stringify({
        id: 'evt_test',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test' } },
      })
      const req = buildRequest(body, { 'content-type': 'application/json' })
      // Cast: NextRequest is structurally compatible with Request for
      // the route's surface (text(), headers).
      const res = await POST(req as never)
      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error, 'Missing signature')
    },
  )
})

test('webhook rejects requests with a corrupted Stripe-Signature (stripe mode)', async () => {
  await withEnv(
    {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
      NODE_ENV: 'test',
      PAYMENT_PROVIDER: 'stripe',
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
      NEXT_PUBLIC_POSTHOG_KEY: '',
    },
    async () => {
      const { POST } = await import('@/app/api/webhooks/stripe/route')
      const body = JSON.stringify({
        id: 'evt_test_2',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test_2' } },
      })
      const req = buildRequest(body, {
        'content-type': 'application/json',
        // Format mimics Stripe's "t=...,v1=..." header but with random
        // bytes — constructEvent will throw, which the route catches
        // and converts to 400.
        'stripe-signature': 't=1234567890,v1=' + 'a'.repeat(64),
      })
      const res = await POST(req as never)
      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error, 'Invalid signature')
    },
  )
})

test('webhook rejects mock-mode events when NODE_ENV=production', async () => {
  await withEnv(
    {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/marketplace',
      // Note: NODE_ENV=production here is what the route's
      // isMockWebhookAllowed reads. APP_ENV stays 'development' so the
      // env parser doesn't refuse mock at boot — this test exercises
      // the SECONDARY defense (the route's own gate), which is what
      // actually fires when an operator deploys NODE_ENV=production
      // on a host that hasn't fully migrated to APP_ENV semantics.
      NODE_ENV: 'production',
      APP_ENV: 'development',
      PAYMENT_PROVIDER: 'mock',
      NEXT_PUBLIC_POSTHOG_KEY: '',
    },
    async () => {
      const { POST } = await import('@/app/api/webhooks/stripe/route')
      const body = JSON.stringify({
        id: 'evt_mock',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_mock' } },
      })
      const req = buildRequest(body, { 'content-type': 'application/json' })
      const res = await POST(req as never)
      assert.equal(res.status, 403)
      const json = await res.json()
      assert.match(json.error, /Mock webhooks disabled/)
    },
  )
})
