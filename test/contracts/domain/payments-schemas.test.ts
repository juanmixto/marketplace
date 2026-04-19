import test from 'node:test'
import assert from 'node:assert/strict'
import { stripeCheckoutParamsSchema } from '@/domains/payments/checkout'

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
