import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decideReconcileAction,
  type LocalPaymentSnapshot,
  type StripePaymentIntentSnapshot,
} from '@/domains/payments/reconcile'

/**
 * Pure-decision tests for the reconciliation sweep (#405). The sweeper
 * itself is exercised end-to-end in an integration test; this file
 * pins the matrix so renaming a Stripe status or flipping a decision
 * breaks loudly.
 */

const LOCAL: LocalPaymentSnapshot = {
  providerRef: 'pi_test',
  amount: 12.34,
  currency: 'eur',
}

function remote(
  status: StripePaymentIntentSnapshot['status'],
  overrides: Partial<StripePaymentIntentSnapshot> = {},
): StripePaymentIntentSnapshot {
  return {
    id: 'pi_test',
    status,
    amount: Math.round(12.34 * 100),
    currency: 'eur',
    ...overrides,
  }
}

test('succeeded + matching amount → mark_succeeded', () => {
  const d = decideReconcileAction(LOCAL, remote('succeeded'))
  assert.deepEqual(d, { action: 'mark_succeeded' })
})

test('succeeded + amount mismatch → skip (operator must investigate)', () => {
  const d = decideReconcileAction(LOCAL, remote('succeeded', { amount: 999 }))
  assert.deepEqual(d, { action: 'skip', reason: 'mismatch_amount' })
})

test('succeeded + currency mismatch → skip (operator must investigate)', () => {
  const d = decideReconcileAction(LOCAL, remote('succeeded', { currency: 'usd' }))
  assert.deepEqual(d, { action: 'skip', reason: 'mismatch_amount' })
})

test('succeeded + currency casing difference is fine', () => {
  // Stripe returns lowercase, our column might be upper in test data.
  const d = decideReconcileAction(
    { ...LOCAL, currency: 'EUR' },
    remote('succeeded', { currency: 'eur' }),
  )
  assert.deepEqual(d, { action: 'mark_succeeded' })
})

test('canceled → mark_failed (reason: canceled)', () => {
  const d = decideReconcileAction(LOCAL, remote('canceled'))
  assert.deepEqual(d, { action: 'mark_failed', reason: 'canceled' })
})

test('requires_payment_method → mark_failed (buyer declined, will not recover)', () => {
  const d = decideReconcileAction(LOCAL, remote('requires_payment_method'))
  assert.deepEqual(d, {
    action: 'mark_failed',
    reason: 'requires_payment_method',
  })
})

test('processing → skip (still pending, real-time webhook may yet arrive)', () => {
  const d = decideReconcileAction(LOCAL, remote('processing'))
  assert.deepEqual(d, { action: 'skip', reason: 'still_pending' })
})

test('requires_action → skip (buyer is still on Stripe 3DS page)', () => {
  const d = decideReconcileAction(LOCAL, remote('requires_action'))
  assert.deepEqual(d, { action: 'skip', reason: 'still_pending' })
})

test('requires_confirmation → skip', () => {
  const d = decideReconcileAction(LOCAL, remote('requires_confirmation'))
  assert.deepEqual(d, { action: 'skip', reason: 'still_pending' })
})

test('requires_capture → skip (captured amount not yet settled)', () => {
  const d = decideReconcileAction(LOCAL, remote('requires_capture'))
  assert.deepEqual(d, { action: 'skip', reason: 'still_pending' })
})
