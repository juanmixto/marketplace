import test from 'node:test'
import assert from 'node:assert/strict'
import { stripeCheckoutParamsSchema } from '@/domains/payments/checkout'
import { stripeWebhookEventSchema } from '@/domains/payments/webhook-schemas'

/**
 * Schema-freeze for the Stripe checkout-return URL params. Drift here
 * would silently break the checkout success page when Stripe redirects
 * the buyer back with the order metadata.
 *
 * Caught by `node scripts/audit-domain-contracts.mjs` as a missing
 * freeze. This test closes the loop.
 */

function assertShape(
  label: string,
  schema: { _zod: { def: { shape: Record<string, { _zod: { optin?: string } }> } } },
  expected: { required: readonly string[]; optional: readonly string[] },
) {
  const shape = schema._zod.def.shape
  const actualKeys = Object.keys(shape).sort()
  const expectedKeys = [...expected.required, ...expected.optional].sort()

  assert.deepEqual(actualKeys, expectedKeys, `${label}: schema key set drifted.`)

  const required: string[] = []
  const optional: string[] = []
  for (const [key, field] of Object.entries(shape)) {
    const isOptional = field._zod.optin === 'optional'
    if (isOptional) optional.push(key)
    else required.push(key)
  }
  required.sort()
  optional.sort()

  assert.deepEqual(required, [...expected.required].sort(), `${label}: required drifted.`)
  assert.deepEqual(optional, [...expected.optional].sort(), `${label}: optional drifted.`)
}

test('stripeCheckoutParamsSchema — frozen shape', () => {
  assertShape('stripeCheckoutParamsSchema', stripeCheckoutParamsSchema as never, {
    required: ['orderId', 'secret'],
    optional: [],
  })
})

test('stripeCheckoutParamsSchema — both fields are required strings', () => {
  // Empty strings are rejected — the redirect URL is built from these,
  // so a blank value would land the buyer on a malformed success page.
  const empty = stripeCheckoutParamsSchema.safeParse({ orderId: '', secret: '' })
  assert.equal(empty.success, false)

  const missingSecret = stripeCheckoutParamsSchema.safeParse({ orderId: 'ord_1' })
  assert.equal(missingSecret.success, false)
})

test('stripeWebhookEventSchema — frozen shape', () => {
  assertShape('stripeWebhookEventSchema', stripeWebhookEventSchema as never, {
    required: ['type', 'data'],
    optional: ['id', 'created'],
  })
})

test('stripeWebhookEventSchema — accepts a real-shaped payment_intent.succeeded event', () => {
  const ok = stripeWebhookEventSchema.safeParse({
    id: 'evt_test_123',
    type: 'payment_intent.succeeded',
    created: 1_700_000_000,
    data: {
      object: {
        id: 'pi_test_456',
        amount: 4200,
        currency: 'eur',
      },
    },
  })
  assert.equal(ok.success, true)
})

test('stripeWebhookEventSchema — rejects payload missing type', () => {
  const result = stripeWebhookEventSchema.safeParse({
    id: 'evt_1',
    data: { object: {} },
  })
  assert.equal(result.success, false)
})

test('stripeWebhookEventSchema — rejects payload missing data envelope', () => {
  const result = stripeWebhookEventSchema.safeParse({
    id: 'evt_1',
    type: 'payment_intent.succeeded',
  })
  assert.equal(result.success, false)
})

test('stripeWebhookEventSchema — accepts mock-mode events with no id', () => {
  // The route synthesizes an id from the body hash when Stripe's
  // mock fixtures omit it; the schema must allow that path.
  const ok = stripeWebhookEventSchema.safeParse({
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_mock_1' } },
  })
  assert.equal(ok.success, true)
})
