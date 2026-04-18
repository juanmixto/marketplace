import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import {
  reconcilePendingPayments,
  type StripePaymentIntentFetcher,
  type StripePaymentIntentSnapshot,
} from '@/domains/payments/reconcile'
import {
  createUser,
  createVendorUser,
  resetIntegrationDatabase,
} from './helpers'

/**
 * End-to-end reconciliation sweep (#405): seeds a PENDING Payment
 * older than the cutoff, injects a fake Stripe fetcher, asserts the
 * local state transitions.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
  Object.assign(process.env, { NODE_ENV: 'test' })
})

afterEach(() => {})

async function seedPendingOrderAndPayment(ageMinutes: number) {
  const buyer = await createUser('CUSTOMER')
  const { vendor } = await createVendorUser()
  const pastCreatedAt = new Date(Date.now() - ageMinutes * 60 * 1000)

  const order = await db.order.create({
    data: {
      orderNumber: `R-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId: buyer.id,
      status: 'PLACED',
      paymentStatus: 'PENDING',
      subtotal: 10,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 10,
      fulfillments: { create: { vendorId: vendor.id, status: 'CONFIRMED' } },
    },
  })

  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      amount: 10,
      currency: 'eur',
      status: 'PENDING',
      provider: 'stripe',
      providerRef: `pi_test_${Math.random().toString(36).slice(2, 10)}`,
      createdAt: pastCreatedAt,
    },
  })

  return { buyer, vendor, order, payment }
}

function fakeStripe(
  byRef: Record<string, StripePaymentIntentSnapshot>,
): StripePaymentIntentFetcher {
  return {
    async retrieve(id) {
      const pi = byRef[id]
      if (!pi) throw new Error(`fakeStripe: no snapshot for ${id}`)
      return pi
    },
  }
}

test('sweeper marks PENDING Payment SUCCEEDED when Stripe says succeeded', async () => {
  const { order, payment } = await seedPendingOrderAndPayment(120)
  const stripe = fakeStripe({
    [payment.providerRef!]: {
      id: payment.providerRef!,
      status: 'succeeded',
      amount: 1000,
      currency: 'eur',
    },
  })

  const report = await reconcilePendingPayments({ db, stripe, olderThanMinutes: 60 })

  assert.equal(report.reviewed, 1)
  assert.equal(report.markedSucceeded, 1)
  assert.equal(report.markedFailed, 0)
  assert.equal(report.skipped, 0)

  const fresh = await db.payment.findUnique({ where: { id: payment.id } })
  assert.equal(fresh?.status, 'SUCCEEDED')
  const freshOrder = await db.order.findUnique({ where: { id: order.id } })
  assert.equal(freshOrder?.paymentStatus, 'SUCCEEDED')
  assert.equal(freshOrder?.status, 'PAYMENT_CONFIRMED')

  const events = await db.orderEvent.findMany({ where: { orderId: order.id } })
  const confirmedEvent = events.find(e => e.type === 'PAYMENT_CONFIRMED')
  assert.ok(confirmedEvent, 'PAYMENT_CONFIRMED OrderEvent recorded')
})

test('sweeper marks PENDING Payment FAILED when Stripe says canceled', async () => {
  const { order, payment } = await seedPendingOrderAndPayment(120)
  const stripe = fakeStripe({
    [payment.providerRef!]: {
      id: payment.providerRef!,
      status: 'canceled',
      amount: 1000,
      currency: 'eur',
    },
  })

  const report = await reconcilePendingPayments({ db, stripe, olderThanMinutes: 60 })

  assert.equal(report.markedFailed, 1)
  const fresh = await db.payment.findUnique({ where: { id: payment.id } })
  assert.equal(fresh?.status, 'FAILED')
  const freshOrder = await db.order.findUnique({ where: { id: order.id } })
  assert.equal(freshOrder?.paymentStatus, 'FAILED')
})

test('sweeper skips recent (< cutoff) PENDING Payments', async () => {
  const { payment } = await seedPendingOrderAndPayment(10) // only 10 min old
  const stripe = fakeStripe({
    [payment.providerRef!]: {
      id: payment.providerRef!,
      status: 'succeeded',
      amount: 1000,
      currency: 'eur',
    },
  })

  const report = await reconcilePendingPayments({ db, stripe, olderThanMinutes: 60 })

  assert.equal(report.reviewed, 0)
  const fresh = await db.payment.findUnique({ where: { id: payment.id } })
  assert.equal(fresh?.status, 'PENDING', 'too-young payment untouched')
})

test('sweeper skips and logs when Stripe amount mismatches local', async () => {
  const { order, payment } = await seedPendingOrderAndPayment(120)
  const stripe = fakeStripe({
    [payment.providerRef!]: {
      id: payment.providerRef!,
      status: 'succeeded',
      amount: 50_000, // local says 1000 cents, Stripe says 50000 cents
      currency: 'eur',
    },
  })

  const report = await reconcilePendingPayments({ db, stripe, olderThanMinutes: 60 })

  assert.equal(report.skipped, 1)
  assert.equal(report.markedSucceeded, 0)
  const fresh = await db.payment.findUnique({ where: { id: payment.id } })
  assert.equal(fresh?.status, 'PENDING', 'mismatched payment NOT confirmed')
  const freshOrder = await db.order.findUnique({ where: { id: order.id } })
  assert.equal(freshOrder?.paymentStatus, 'PENDING')
})

test('sweeper is idempotent — re-running does not double-apply', async () => {
  const { payment } = await seedPendingOrderAndPayment(120)
  const stripe = fakeStripe({
    [payment.providerRef!]: {
      id: payment.providerRef!,
      status: 'succeeded',
      amount: 1000,
      currency: 'eur',
    },
  })

  const first = await reconcilePendingPayments({ db, stripe, olderThanMinutes: 60 })
  const second = await reconcilePendingPayments({ db, stripe, olderThanMinutes: 60 })

  assert.equal(first.markedSucceeded, 1)
  assert.equal(second.reviewed, 0, 'second pass sees no PENDING candidates')
})
