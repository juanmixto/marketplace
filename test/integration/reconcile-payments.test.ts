import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import {
  reconcileAbandonedOrders,
  reconcilePendingPayments,
  type StripePaymentIntentFetcher,
  type StripePaymentIntentSnapshot,
} from '@/domains/payments/reconcile'
import {
  createActiveProduct,
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

// ─── #1161 H-5: orphan-Order recovery sweep ────────────────────────────────

async function seedAbandonedOrder({
  ageMinutes,
  trackStock = true,
  initialStock = 10,
  quantity = 2,
  withPromotion = false,
}: {
  ageMinutes: number
  trackStock?: boolean
  initialStock?: number
  quantity?: number
  withPromotion?: boolean
}) {
  const buyer = await createUser('CUSTOMER')
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, {
    stock: initialStock - quantity,
    basePrice: 10,
    trackStock,
  })

  let promotionId: string | undefined
  if (withPromotion) {
    const promo = await db.promotion.create({
      data: {
        vendorId: vendor.id,
        name: 'Test promo',
        kind: 'PERCENTAGE',
        scope: 'VENDOR',
        value: 10,
        startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        redemptionCount: 1,
      },
    })
    promotionId = promo.id
  }

  const pastCreatedAt = new Date(Date.now() - ageMinutes * 60 * 1000)
  const order = await db.order.create({
    data: {
      orderNumber: `OAB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      checkoutAttemptId: `cat_test_${Math.random().toString(36).slice(2)}`,
      customerId: buyer.id,
      status: 'PLACED',
      paymentStatus: 'PENDING',
      subtotal: 20,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 20,
      lines: {
        create: [{
          productId: product.id,
          vendorId: vendor.id,
          quantity,
          unitPrice: 10,
          taxRate: 0,
          productSnapshot: { id: product.id, name: product.name, slug: product.slug },
        }],
      },
      fulfillments: {
        create: [{
          vendorId: vendor.id,
          status: 'PENDING',
          ...(promotionId ? { promotionId, discountAmount: 2 } : {}),
        }],
      },
    },
  })

  // Payment row with providerRef=null mimics a process that died after
  // commit but before createPaymentIntent linked the ref.
  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      amount: 20,
      currency: 'EUR',
      status: 'PENDING',
      provider: 'stripe',
      providerRef: null,
      createdAt: pastCreatedAt,
    },
  })

  return { buyer, vendor, product, order, payment, promotionId, quantity }
}

test('orphan sweep restocks Product, marks Order CANCELLED + frees attemptId (#1161 H-5)', async () => {
  const { product, order, payment, quantity } = await seedAbandonedOrder({ ageMinutes: 60 })

  const report = await reconcileAbandonedOrders({ db, olderThanMinutes: 30 })

  assert.equal(report.reviewed, 1)
  assert.equal(report.reverted, 1)

  const refreshedProduct = await db.product.findUnique({
    where: { id: product.id },
    select: { stock: true },
  })
  // Initial 10 - 2 (decremented at order creation) + 2 (restored) = 10.
  assert.equal(refreshedProduct?.stock, 10 - quantity + quantity)

  const refreshedOrder = await db.order.findUnique({ where: { id: order.id } })
  assert.equal(refreshedOrder?.status, 'CANCELLED')
  assert.equal(refreshedOrder?.paymentStatus, 'FAILED')
  assert.equal(refreshedOrder?.checkoutAttemptId, null, 'attemptId freed for buyer retry')

  const refreshedPayment = await db.payment.findUnique({ where: { id: payment.id } })
  assert.equal(refreshedPayment?.status, 'FAILED')

  const events = await db.orderEvent.findMany({
    where: { orderId: order.id, type: 'ORDER_ABANDONED_PRE_PI' },
  })
  assert.equal(events.length, 1, 'audit OrderEvent recorded once')
})

test('orphan sweep decrements Promotion.redemptionCount (#1161 H-5)', async () => {
  const { promotionId } = await seedAbandonedOrder({ ageMinutes: 60, withPromotion: true })

  await reconcileAbandonedOrders({ db, olderThanMinutes: 30 })

  const promo = await db.promotion.findUnique({ where: { id: promotionId! } })
  assert.equal(promo?.redemptionCount, 0, 'redemption restored from 1 → 0')
})

test('orphan sweep skips recent (< cutoff) orphans', async () => {
  const { order } = await seedAbandonedOrder({ ageMinutes: 5 })

  const report = await reconcileAbandonedOrders({ db, olderThanMinutes: 30 })

  assert.equal(report.reviewed, 0)
  const refreshedOrder = await db.order.findUnique({ where: { id: order.id } })
  assert.equal(refreshedOrder?.status, 'PLACED', 'too-young orphan untouched')
})

test('orphan sweep is idempotent — re-running does not double-restore', async () => {
  const { product, quantity } = await seedAbandonedOrder({ ageMinutes: 60 })

  await reconcileAbandonedOrders({ db, olderThanMinutes: 30 })
  const second = await reconcileAbandonedOrders({ db, olderThanMinutes: 30 })

  assert.equal(second.reverted, 0, 'second pass sees nothing to revert')
  const fresh = await db.product.findUnique({
    where: { id: product.id },
    select: { stock: true },
  })
  assert.equal(fresh?.stock, 10, 'stock not double-incremented')
  void quantity
})

test('orphan sweep does NOT touch products with trackStock=false', async () => {
  const { product } = await seedAbandonedOrder({
    ageMinutes: 60,
    trackStock: false,
    initialStock: 0, // unused since trackStock=false; mirrors checkout's no-decrement path
  })

  // The seed sets stock to (initialStock - quantity) = (0 - 2) = -2 because the
  // helper applies the decrement unconditionally. For trackStock=false we want
  // to assert the sweep does NOT increment.
  const before = await db.product.findUnique({
    where: { id: product.id },
    select: { stock: true },
  })

  await reconcileAbandonedOrders({ db, olderThanMinutes: 30 })

  const after = await db.product.findUnique({
    where: { id: product.id },
    select: { stock: true },
  })
  assert.equal(after?.stock, before?.stock, 'untracked product stock untouched')
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
