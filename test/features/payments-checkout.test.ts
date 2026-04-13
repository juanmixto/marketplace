import test from 'node:test'
import assert from 'node:assert/strict'
import { isMockClientSecret, stripeCheckoutParamsSchema } from '@/domains/payments/checkout'

test('stripeCheckoutParamsSchema requires orderId and secret', () => {
  const parsed = stripeCheckoutParamsSchema.safeParse({
    orderId: 'ord_123',
    secret: 'pi_123_secret_abc',
  })

  assert.equal(parsed.success, true)
})

test('stripeCheckoutParamsSchema rejects incomplete query params', () => {
  const parsed = stripeCheckoutParamsSchema.safeParse({
    orderId: '',
    secret: '',
  })

  assert.equal(parsed.success, false)
})

test('isMockClientSecret distinguishes mock and stripe secrets', () => {
  assert.equal(isMockClientSecret('mock_pi_123_secret'), true)
  assert.equal(isMockClientSecret('pi_123_secret_abc'), false)
})
