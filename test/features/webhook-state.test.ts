import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldApplyPaymentFailed, shouldApplyPaymentSucceeded } from '@/domains/payments/webhook'

test('shouldApplyPaymentSucceeded still advances when order status lags behind success', () => {
  assert.equal(
    shouldApplyPaymentSucceeded({
      paymentStatus: 'PENDING',
      orderPaymentStatus: 'SUCCEEDED',
      orderStatus: 'PLACED',
    }),
    true
  )
})

test('shouldApplyPaymentFailed returns false when the order already marks payment as succeeded', () => {
  assert.equal(
    shouldApplyPaymentFailed({
      paymentStatus: 'PENDING',
      orderPaymentStatus: 'SUCCEEDED',
      orderStatus: 'PAYMENT_CONFIRMED',
    }),
    false
  )
})

test('shouldApplyPaymentFailed returns true for a fresh pending snapshot', () => {
  assert.equal(
    shouldApplyPaymentFailed({
      paymentStatus: 'PENDING',
      orderPaymentStatus: 'PENDING',
      orderStatus: 'PAYMENT_CONFIRMED',
    }),
    true
  )
})

test('shouldApplyPaymentSucceeded refuses to resurrect a CANCELLED order', () => {
  assert.equal(
    shouldApplyPaymentSucceeded({
      paymentStatus: 'PENDING',
      orderPaymentStatus: 'PENDING',
      orderStatus: 'CANCELLED',
    }),
    false
  )
})

test('shouldApplyPaymentSucceeded refuses to resurrect a REFUNDED order', () => {
  assert.equal(
    shouldApplyPaymentSucceeded({
      paymentStatus: 'SUCCEEDED',
      orderPaymentStatus: 'REFUNDED',
      orderStatus: 'REFUNDED',
    }),
    false
  )
})
