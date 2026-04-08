import test from 'node:test'
import assert from 'node:assert/strict'
import { confirmMockPayment, createPaymentIntent } from '@/domains/payments/provider'
import { resetServerEnvCache } from '@/lib/env'

function withMockEnv<T>(fn: () => Promise<T>) {
  const originalEnv = { ...process.env }
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/marketplace'
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  process.env.PAYMENT_PROVIDER = 'mock'
  resetServerEnvCache()

  return fn().finally(() => {
    process.env = originalEnv
    resetServerEnvCache()
  })
}

test('createPaymentIntent returns a mock client secret in mock mode', async () => {
  await withMockEnv(async () => {
    const intent = await createPaymentIntent(2495, { orderId: 'ord_123' })

    assert.match(intent.id, /^mock_pi_/)
    assert.equal(intent.clientSecret.startsWith(intent.id), true)
    assert.equal(intent.amount, 2495)
  })
})

test('confirmMockPayment accepts mock payment intents', async () => {
  await assert.doesNotReject(() => confirmMockPayment('mock_pi_123_secret'))
})

test('confirmMockPayment rejects non mock payment intents', async () => {
  await assert.rejects(() => confirmMockPayment('pi_123_secret_abc'), /non-mock intent/)
})
