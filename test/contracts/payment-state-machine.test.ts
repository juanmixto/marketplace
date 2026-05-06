import test from 'node:test'
import assert from 'node:assert/strict'
import type { OrderStatus, PaymentStatus } from '@/generated/prisma/enums'
import {
  shouldApplyPaymentSucceeded,
  shouldApplyPaymentFailed,
} from '@/domains/payments/webhook'

/**
 * Contract test for the Payment-side guards that decide whether a
 * Stripe webhook event (`payment_intent.succeeded` /
 * `payment_intent.payment_failed`) should be applied to an Order.
 *
 * The guards are pure functions over a `(paymentStatus,
 * orderPaymentStatus, orderStatus)` snapshot and protect against
 * three known failure modes:
 *
 *  - Late `succeeded` after a `cancelled`/`refunded` resurrects a
 *    cancelled order (charges buyer with no fulfillment intent).
 *  - Late `succeeded` overwrites a `PARTIALLY_REFUNDED` paymentStatus
 *    back to SUCCEEDED, hiding the partial refund from buyer pages
 *    and settlement reconciliation.
 *  - Late `failed` after a `succeeded` invalidates the captured
 *    payment.
 *
 * The matrix below is exhaustive over the relevant subset of
 * (PaymentStatus × PaymentStatus × OrderStatus). The full Cartesian
 * is too noisy; impossible combos (e.g. `paymentStatus=REFUNDED` with
 * `orderStatus=PLACED`) are skipped because they cannot occur in
 * production.
 */

// ─── shouldApplyPaymentSucceeded ─────────────────────────────────────────────

test('shouldApplyPaymentSucceeded: the only "apply" path is PLACED + PENDING + PENDING', () => {
  // The happy path: nothing has been applied yet.
  assert.equal(
    shouldApplyPaymentSucceeded({
      paymentStatus: 'PENDING',
      orderPaymentStatus: 'PENDING',
      orderStatus: 'PLACED',
    }),
    true,
  )
})

test('shouldApplyPaymentSucceeded: idempotent on already-confirmed', () => {
  assert.equal(
    shouldApplyPaymentSucceeded({
      paymentStatus: 'SUCCEEDED',
      orderPaymentStatus: 'SUCCEEDED',
      orderStatus: 'PAYMENT_CONFIRMED',
    }),
    false,
    'all three already confirmed → idempotent skip',
  )
})

test('shouldApplyPaymentSucceeded: refuses CANCELLED order (resurrection guard)', () => {
  for (const ps of ['PENDING', 'SUCCEEDED', 'FAILED'] as PaymentStatus[]) {
    for (const ops of ['PENDING', 'SUCCEEDED', 'FAILED'] as PaymentStatus[]) {
      assert.equal(
        shouldApplyPaymentSucceeded({
          paymentStatus: ps,
          orderPaymentStatus: ops,
          orderStatus: 'CANCELLED',
        }),
        false,
        `CANCELLED order with payment=${ps}/orderPayment=${ops} must refuse`,
      )
    }
  }
})

test('shouldApplyPaymentSucceeded: refuses REFUNDED order (resurrection guard)', () => {
  for (const ps of ['PENDING', 'SUCCEEDED', 'REFUNDED'] as PaymentStatus[]) {
    assert.equal(
      shouldApplyPaymentSucceeded({
        paymentStatus: ps,
        orderPaymentStatus: 'REFUNDED',
        orderStatus: 'REFUNDED',
      }),
      false,
    )
  }
})

test('shouldApplyPaymentSucceeded: refuses when orderPaymentStatus is REFUNDED or PARTIALLY_REFUNDED (#1149 H-2)', () => {
  for (const ops of ['REFUNDED', 'PARTIALLY_REFUNDED'] as PaymentStatus[]) {
    assert.equal(
      shouldApplyPaymentSucceeded({
        paymentStatus: 'PENDING',
        orderPaymentStatus: ops,
        orderStatus: 'PAYMENT_CONFIRMED',
      }),
      false,
      `partial refund (orderPaymentStatus=${ops}) must not be overwritten by late succeeded`,
    )
  }
})

test('shouldApplyPaymentSucceeded: applies when payment lags behind order (re-sync)', () => {
  // The Stripe webhook arrives after the buyer-action callback persisted
  // the Order but before the Payment row caught up.
  assert.equal(
    shouldApplyPaymentSucceeded({
      paymentStatus: 'PENDING',
      orderPaymentStatus: 'PENDING',
      orderStatus: 'PAYMENT_CONFIRMED',
    }),
    true,
  )
})

// ─── shouldApplyPaymentFailed ────────────────────────────────────────────────

test('shouldApplyPaymentFailed: refuses when payment already SUCCEEDED', () => {
  // Any path that reaches SUCCEEDED is a captured payment; a "failed"
  // event after that is a Stripe replay of an obsolete state and must
  // be ignored.
  for (const ops of ['PENDING', 'SUCCEEDED', 'PARTIALLY_REFUNDED'] as PaymentStatus[]) {
    for (const os of ['PLACED', 'PAYMENT_CONFIRMED', 'PROCESSING'] as OrderStatus[]) {
      assert.equal(
        shouldApplyPaymentFailed({
          paymentStatus: 'SUCCEEDED',
          orderPaymentStatus: ops,
          orderStatus: os,
        }),
        false,
      )
    }
  }
})

test('shouldApplyPaymentFailed: refuses when orderPaymentStatus is SUCCEEDED', () => {
  for (const ps of ['PENDING', 'FAILED'] as PaymentStatus[]) {
    assert.equal(
      shouldApplyPaymentFailed({
        paymentStatus: ps,
        orderPaymentStatus: 'SUCCEEDED',
        orderStatus: 'PAYMENT_CONFIRMED',
      }),
      false,
    )
  }
})

test('shouldApplyPaymentFailed: idempotent on already-failed', () => {
  assert.equal(
    shouldApplyPaymentFailed({
      paymentStatus: 'FAILED',
      orderPaymentStatus: 'FAILED',
      orderStatus: 'PLACED',
    }),
    false,
  )
})

test('shouldApplyPaymentFailed: applies on PENDING/PENDING (the only happy path)', () => {
  assert.equal(
    shouldApplyPaymentFailed({
      paymentStatus: 'PENDING',
      orderPaymentStatus: 'PENDING',
      orderStatus: 'PLACED',
    }),
    true,
  )
})

test('shouldApplyPaymentFailed: applies when payment lags behind order (re-sync)', () => {
  // Webhook says failed; payment was PENDING; order was already CANCELLED
  // by a buyer-side timeout. The guard does not look at orderStatus and
  // intentionally lets the failed event re-stamp the Payment row.
  assert.equal(
    shouldApplyPaymentFailed({
      paymentStatus: 'PENDING',
      orderPaymentStatus: 'FAILED',
      orderStatus: 'CANCELLED',
    }),
    true,
  )
})
