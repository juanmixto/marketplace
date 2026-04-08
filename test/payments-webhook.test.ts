import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldApplyPaymentFailed, shouldApplyPaymentSucceeded } from '@/domains/payments/webhook'

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
