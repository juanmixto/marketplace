import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createOrder, confirmOrder } from '@/domains/orders/actions'
import { cancelOrderWithRefundPolicy } from '@/domains/orders'
import { advanceFulfillment } from '@/domains/vendors/actions'
import { db } from '@/lib/db'
import { resetServerEnvCache } from '@/lib/env'
import {
  buildSession,
  clearTestSession,
  createActiveProduct,
  createUser,
  createVendorUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

/**
 * Full Order state-machine flow integration test (#1321).
 *
 * Existing tests cover individual transitions in isolation; this one
 * walks an Order across the entire happy path and exercises the
 * canonical sad paths to catch contract drift between transitions.
 *
 * Motivating bug class (2026-05-04 incidents #1195/#1203/#1205):
 * a webhook handler that flips Order.status without advancing
 * paymentStatus passes every per-transition test but breaks the
 * invariant the next transition assumes.
 */

const ADDRESS = {
  firstName: 'Test',
  lastName: 'Flow',
  line1: 'Calle Mayor 10',
  city: 'Madrid',
  province: 'Madrid',
  postalCode: '28001',
} as const

beforeEach(async () => {
  await resetIntegrationDatabase()
  Object.assign(process.env, { PAYMENT_PROVIDER: 'mock', NODE_ENV: 'test' })
  resetServerEnvCache()
})

afterEach(() => {
  clearTestSession()
  resetServerEnvCache()
})

async function setupBuyerWithProduct(opts?: { basePrice?: number; stock?: number }) {
  const buyer = await createUser('CUSTOMER')
  const { user: vendorUser, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, {
    basePrice: opts?.basePrice ?? 12,
    stock: opts?.stock ?? 5,
  })
  return { buyer, vendorUser, vendor, product }
}

// ─── Happy path ──────────────────────────────────────────────────────────────

test('happy path: PLACED → PAYMENT_CONFIRMED → SHIPPED with single vendor', async () => {
  const { buyer, vendorUser, product } = await setupBuyerWithProduct({ basePrice: 12 })

  // Step 1 — createOrder
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const created = await createOrder(
    [{ productId: product.id, quantity: 2 }],
    { address: ADDRESS, saveAddress: false },
  )

  let order = await db.order.findUnique({ where: { id: created.orderId } })
  assert.equal(order?.status, 'PLACED', 'createOrder leaves Order PLACED')
  assert.equal(order?.paymentStatus, 'PENDING', 'paymentStatus is PENDING before confirm')

  const paymentBefore = await db.payment.findFirst({ where: { orderId: created.orderId } })
  assert.ok(paymentBefore, 'a Payment row is persisted at createOrder time')
  assert.equal(paymentBefore?.status, 'PENDING')

  const fulfillmentBefore = await db.vendorFulfillment.findFirst({
    where: { orderId: created.orderId },
  })
  assert.ok(fulfillmentBefore, 'a VendorFulfillment row is persisted at createOrder time')
  assert.equal(fulfillmentBefore?.status, 'PENDING')

  // Step 2 — confirmOrder (mock-mode webhook simulation)
  const providerRef = created.clientSecret.replace('_secret', '')
  await confirmOrder(created.orderId, providerRef)

  order = await db.order.findUnique({ where: { id: created.orderId } })
  assert.equal(order?.status, 'PAYMENT_CONFIRMED', 'confirmOrder flips Order to PAYMENT_CONFIRMED')
  assert.equal(order?.paymentStatus, 'SUCCEEDED', 'paymentStatus follows status')

  const paymentAfter = await db.payment.findFirst({ where: { orderId: created.orderId } })
  assert.equal(paymentAfter?.status, 'SUCCEEDED', 'Payment row is SUCCEEDED after confirm')

  // Step 3 — advanceFulfillment PENDING → CONFIRMED → PREPARING → READY
  // Order.status should NOT change; only the parent re-stamp at SHIPPED.
  useTestSession(buildSession(vendorUser.id, 'VENDOR'))
  await advanceFulfillment(fulfillmentBefore!.id)
  await advanceFulfillment(fulfillmentBefore!.id)
  await advanceFulfillment(fulfillmentBefore!.id)

  order = await db.order.findUnique({ where: { id: created.orderId } })
  assert.equal(
    order?.status,
    'PAYMENT_CONFIRMED',
    'Order stays PAYMENT_CONFIRMED while fulfillment moves PENDING→READY',
  )

  const fulfillmentAtReady = await db.vendorFulfillment.findUnique({
    where: { id: fulfillmentBefore!.id },
  })
  assert.equal(fulfillmentAtReady?.status, 'READY')

  // Step 4 — advanceFulfillment READY → SHIPPED. Single vendor → Order=SHIPPED.
  await advanceFulfillment(fulfillmentBefore!.id)

  order = await db.order.findUnique({ where: { id: created.orderId } })
  assert.equal(order?.status, 'SHIPPED', 'Order flips to SHIPPED when the only fulfillment ships')

  const shippedFulfillment = await db.vendorFulfillment.findUnique({
    where: { id: fulfillmentBefore!.id },
  })
  assert.equal(shippedFulfillment?.status, 'SHIPPED')
  assert.ok(shippedFulfillment?.shippedAt, 'shippedAt is stamped')
})

// ─── Sad paths ──────────────────────────────────────────────────────────────

test('idempotent confirm: same providerRef twice → no double-flip, no duplicate Payment', async () => {
  const { buyer, product } = await setupBuyerWithProduct()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false },
  )
  const providerRef = created.clientSecret.replace('_secret', '')

  await confirmOrder(created.orderId, providerRef)
  // Replay — same Stripe event id, must be a no-op rather than producing a
  // second Payment row or re-firing the OrderEvent.
  await confirmOrder(created.orderId, providerRef)

  const order = await db.order.findUnique({ where: { id: created.orderId } })
  assert.equal(order?.status, 'PAYMENT_CONFIRMED')

  const payments = await db.payment.findMany({ where: { orderId: created.orderId } })
  assert.equal(payments.length, 1, 'no duplicate Payment row on replay')
})

test('cancel before payment (PLACED, payment PENDING) → CANCELLED, no Stripe call', async () => {
  const { buyer, product } = await setupBuyerWithProduct()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false },
  )

  const result = await cancelOrderWithRefundPolicy({
    orderId: created.orderId,
    reason: 'flow-test pre-payment cancel',
    actor: { type: 'BUYER', id: buyer.id },
  })
  assert.equal(result.refundIssued, false)

  const order = await db.order.findUnique({ where: { id: created.orderId } })
  assert.equal(order?.status, 'CANCELLED')

  const refunds = await db.refund.findMany({})
  assert.equal(refunds.length, 0, 'no Refund row when payment was PENDING')
})

test('cancel after SHIPPED is rejected — cancellation_requires_incident', async () => {
  const { buyer, vendorUser, product } = await setupBuyerWithProduct()

  // Drive the order all the way to SHIPPED.
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false },
  )
  await confirmOrder(created.orderId, created.clientSecret.replace('_secret', ''))

  const fulfillment = await db.vendorFulfillment.findFirst({
    where: { orderId: created.orderId },
  })
  useTestSession(buildSession(vendorUser.id, 'VENDOR'))
  for (const _ of [0, 1, 2, 3]) await advanceFulfillment(fulfillment!.id) // PENDING→…→SHIPPED

  const orderAtShipped = await db.order.findUnique({ where: { id: created.orderId } })
  assert.equal(orderAtShipped?.status, 'SHIPPED')

  // Now try to cancel — must throw.
  const admin = await createUser('SUPERADMIN')
  await assert.rejects(
    () =>
      cancelOrderWithRefundPolicy({
        orderId: created.orderId,
        reason: 'flow-test post-ship cancel',
        actor: { type: 'ADMIN', id: admin.id },
      }),
    /cancellation_requires_incident/,
    'SHIPPED orders must require the incident flow',
  )

  const stillShipped = await db.order.findUnique({ where: { id: created.orderId } })
  assert.equal(stillShipped?.status, 'SHIPPED', 'Order stays SHIPPED on rejected cancel')
})

test('post-payment cancel by ADMIN issues full Stripe refund and flips Order to REFUNDED', async () => {
  const { buyer, product } = await setupBuyerWithProduct({ basePrice: 30 })
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false },
  )
  await confirmOrder(created.orderId, created.clientSecret.replace('_secret', ''))

  const orderAfterConfirm = await db.order.findUnique({ where: { id: created.orderId } })
  assert.equal(orderAfterConfirm?.status, 'PAYMENT_CONFIRMED')

  const admin = await createUser('SUPERADMIN')
  const result = await cancelOrderWithRefundPolicy({
    orderId: created.orderId,
    reason: 'flow-test post-pay cancel',
    actor: { type: 'ADMIN', id: admin.id },
  })
  assert.equal(result.refundIssued, true)

  const refunded = await db.order.findUnique({ where: { id: created.orderId } })
  assert.equal(refunded?.status, 'REFUNDED', 'post-pay cancel transitions Order to REFUNDED')
  assert.equal(refunded?.paymentStatus, 'REFUNDED')

  const refunds = await db.refund.findMany({})
  assert.equal(refunds.length, 1, 'a Refund row is created for the post-pay cancel')
})

test('buyer cannot cancel another buyer\'s order — forbidden', async () => {
  const { buyer, product } = await setupBuyerWithProduct()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false },
  )

  const otherBuyer = await createUser('CUSTOMER')
  await assert.rejects(
    () =>
      cancelOrderWithRefundPolicy({
        orderId: created.orderId,
        reason: 'flow-test foreign cancel',
        actor: { type: 'BUYER', id: otherBuyer.id },
      }),
    /forbidden/,
  )

  const stillPlaced = await db.order.findUnique({ where: { id: created.orderId } })
  assert.equal(stillPlaced?.status, 'PLACED', 'Order untouched after rejected foreign cancel')
})
