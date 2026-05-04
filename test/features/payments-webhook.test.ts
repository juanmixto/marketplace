import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertProviderRefForPaymentStatus,
  doesWebhookPaymentMatchStoredPayment,
  isRetryableWebhookError,
  parseWebhookPaymentIntent,
  retryWebhookOperation,
  shouldApplyPaymentFailed,
  shouldApplyPaymentSucceeded,
} from '@/domains/payments/webhook'

test('shouldApplyPaymentSucceeded returns true for a pending payment', () => {
  assert.equal(
    shouldApplyPaymentSucceeded({
      paymentStatus: 'PENDING',
      orderPaymentStatus: 'PENDING',
      orderStatus: 'PLACED',
    }),
    true
  )
})

test('shouldApplyPaymentSucceeded returns false for an already confirmed payment', () => {
  assert.equal(
    shouldApplyPaymentSucceeded({
      paymentStatus: 'SUCCEEDED',
      orderPaymentStatus: 'SUCCEEDED',
      orderStatus: 'PAYMENT_CONFIRMED',
    }),
    false
  )
})

test('shouldApplyPaymentSucceeded can repair an inconsistent confirmed state', () => {
  assert.equal(
    shouldApplyPaymentSucceeded({
      paymentStatus: 'SUCCEEDED',
      orderPaymentStatus: 'SUCCEEDED',
      orderStatus: 'PLACED',
    }),
    true
  )
})

test('shouldApplyPaymentFailed returns true for a pending payment', () => {
  assert.equal(
    shouldApplyPaymentFailed({
      paymentStatus: 'PENDING',
      orderPaymentStatus: 'PENDING',
      orderStatus: 'PLACED',
    }),
    true
  )
})

test('shouldApplyPaymentFailed returns false once payment already succeeded', () => {
  assert.equal(
    shouldApplyPaymentFailed({
      paymentStatus: 'SUCCEEDED',
      orderPaymentStatus: 'SUCCEEDED',
      orderStatus: 'PAYMENT_CONFIRMED',
    }),
    false
  )
})

test('shouldApplyPaymentFailed returns false for an already failed payment', () => {
  assert.equal(
    shouldApplyPaymentFailed({
      paymentStatus: 'FAILED',
      orderPaymentStatus: 'FAILED',
      orderStatus: 'PLACED',
    }),
    false
  )
})

test('shouldApplyPaymentSucceeded refuses to resurrect a fully refunded order (#1149 H-2)', () => {
  // A late `payment_intent.succeeded` arriving after a refund must not flip
  // the order back to PAYMENT_CONFIRMED. We block on either side: orderStatus
  // === REFUNDED (existing) OR orderPaymentStatus IN (REFUNDED, PARTIALLY_REFUNDED).
  assert.equal(
    shouldApplyPaymentSucceeded({
      paymentStatus: 'REFUNDED',
      orderPaymentStatus: 'REFUNDED',
      orderStatus: 'REFUNDED',
    }),
    false,
    'fully refunded order must not be resurrected'
  )
})

test('shouldApplyPaymentSucceeded refuses partial-refunded order (#1149 H-2)', () => {
  // Partial refunds keep `orderStatus = PAYMENT_CONFIRMED` (the order is
  // still being fulfilled for the unrefunded portion) but flip
  // `paymentStatus = PARTIALLY_REFUNDED`. A late succeeded webhook must not
  // overwrite that paymentStatus back to SUCCEEDED.
  assert.equal(
    shouldApplyPaymentSucceeded({
      paymentStatus: 'PARTIALLY_REFUNDED',
      orderPaymentStatus: 'PARTIALLY_REFUNDED',
      orderStatus: 'PAYMENT_CONFIRMED',
    }),
    false,
    'partially refunded paymentStatus must be preserved'
  )
})

test('assertProviderRefForPaymentStatus rejects successful transitions without providerRef', () => {
  assert.throws(
    () =>
      assertProviderRefForPaymentStatus({
        providerRef: null,
        nextStatus: 'SUCCEEDED',
      }),
    /providerRef requerido/i
  )
})

test('assertProviderRefForPaymentStatus allows pending payments without providerRef', () => {
  assert.doesNotThrow(() =>
    assertProviderRefForPaymentStatus({
      providerRef: null,
      nextStatus: 'PENDING',
    })
  )
})

test('doesWebhookPaymentMatchStoredPayment returns true for matching amount and currency', () => {
  assert.equal(
    doesWebhookPaymentMatchStoredPayment(
      { amount: 12.34, currency: 'EUR' },
      { amount: 1234, currency: 'eur' }
    ),
    true
  )
})

test('doesWebhookPaymentMatchStoredPayment returns false for mismatched amount', () => {
  assert.equal(
    doesWebhookPaymentMatchStoredPayment(
      { amount: 12.34, currency: 'EUR' },
      { amount: 1200, currency: 'eur' }
    ),
    false
  )
})

test('doesWebhookPaymentMatchStoredPayment returns false for missing webhook currency', () => {
  assert.equal(
    doesWebhookPaymentMatchStoredPayment(
      { amount: 12.34, currency: 'EUR' },
      { amount: 1234 }
    ),
    false
  )
})

test('doesWebhookPaymentMatchStoredPayment returns false for missing webhook amount', () => {
  assert.equal(
    doesWebhookPaymentMatchStoredPayment(
      { amount: 12.34, currency: 'EUR' },
      { currency: 'eur' }
    ),
    false
  )
})

test('doesWebhookPaymentMatchStoredPayment returns false for mismatched currency', () => {
  assert.equal(
    doesWebhookPaymentMatchStoredPayment(
      { amount: 12.34, currency: 'EUR' },
      { amount: 1234, currency: 'usd' }
    ),
    false
  )
})

test('doesWebhookPaymentMatchStoredPayment handles rounding correctly for amounts with sub-cent precision', () => {
  // 9.999 euros → 999 cents (floor), not 1000 — must round, not truncate
  assert.equal(
    doesWebhookPaymentMatchStoredPayment(
      { amount: 9.999, currency: 'EUR' },
      { amount: 1000, currency: 'eur' }
    ),
    true
  )
})

test('isRetryableWebhookError detects transient database failures', () => {
  const error = Object.assign(new Error('database timeout'), { code: 'P1002' })
  assert.equal(isRetryableWebhookError(error), true)
  assert.equal(isRetryableWebhookError(new Error('invalid signature')), false)
})

test('retryWebhookOperation retries transient failures with exponential backoff', async () => {
  const delays: number[] = []
  let attempts = 0

  const result = await retryWebhookOperation(
    async () => {
      attempts += 1
      if (attempts < 3) {
        const error = Object.assign(new Error('temporary database timeout'), { code: 'P1002' })
        throw error
      }

      return 'ok'
    },
    {
      operationName: 'test retry',
      sleep: async delayMs => {
        delays.push(delayMs)
      },
    }
  )

  assert.equal(result, 'ok')
  assert.equal(attempts, 3)
  assert.deepEqual(delays, [100, 200])
})

test('parseWebhookPaymentIntent returns null for non-object inputs', () => {
  assert.equal(parseWebhookPaymentIntent(null), null)
  assert.equal(parseWebhookPaymentIntent(undefined), null)
  assert.equal(parseWebhookPaymentIntent('pi_123'), null)
  assert.equal(parseWebhookPaymentIntent(42), null)
})

test('parseWebhookPaymentIntent rejects payloads without a string id', () => {
  assert.equal(parseWebhookPaymentIntent({}), null)
  assert.equal(parseWebhookPaymentIntent({ id: 123 }), null)
  assert.equal(parseWebhookPaymentIntent({ id: '' }), null)
  assert.equal(parseWebhookPaymentIntent({ id: null }), null)
})

test('parseWebhookPaymentIntent extracts id, amount and currency when valid', () => {
  const result = parseWebhookPaymentIntent({
    id: 'pi_abc',
    amount: 1999,
    currency: 'eur',
    extra: 'ignored',
  })
  assert.deepEqual(result, { id: 'pi_abc', amount: 1999, currency: 'eur' })
})

test('parseWebhookPaymentIntent coerces invalid amount/currency to undefined', () => {
  const result = parseWebhookPaymentIntent({
    id: 'pi_abc',
    amount: 'not-a-number',
    currency: 42,
  })
  assert.deepEqual(result, { id: 'pi_abc', amount: undefined, currency: undefined })
})

test('parseWebhookPaymentIntent treats NaN/Infinity amounts as undefined', () => {
  assert.deepEqual(parseWebhookPaymentIntent({ id: 'pi_a', amount: Number.NaN }), {
    id: 'pi_a',
    amount: undefined,
    currency: undefined,
  })
  assert.deepEqual(parseWebhookPaymentIntent({ id: 'pi_a', amount: Number.POSITIVE_INFINITY }), {
    id: 'pi_a',
    amount: undefined,
    currency: undefined,
  })
})

test('parseWebhookPaymentIntent treats empty currency string as undefined', () => {
  assert.deepEqual(parseWebhookPaymentIntent({ id: 'pi_a', currency: '' }), {
    id: 'pi_a',
    amount: undefined,
    currency: undefined,
  })
})
