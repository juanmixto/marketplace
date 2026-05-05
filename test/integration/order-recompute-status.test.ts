import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { recomputeOrderStatus } from '@/domains/shipping/transitions'
import {
  clearTestSession,
  createUser,
  createVendorUser,
  resetIntegrationDatabase,
} from './helpers'

/**
 * #1336: recomputeOrderStatus must not bump an order to DELIVERED when
 * all its fulfillments are CANCELLED (the prior bug). It also must not
 * undo a terminal state, and a single-vendor order with all
 * fulfillments cancelled should land in CANCELLED.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

async function buildOrderWithFulfillments(
  fulfillmentStatuses: Array<
    'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'INCIDENT' | 'LABEL_FAILED'
  >,
  startStatus: 'PLACED' | 'PAYMENT_CONFIRMED' | 'PROCESSING' | 'PARTIALLY_SHIPPED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED' = 'PAYMENT_CONFIRMED',
) {
  const buyer = await createUser('CUSTOMER')
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-${randomUUID().slice(0, 8)}`,
      customerId: buyer.id,
      status: startStatus,
      paymentStatus: 'SUCCEEDED',
      subtotal: 100,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 100,
    },
  })

  // Pre-create the vendors we need so each fulfillment has a fresh
  // vendorId. Multi-vendor orders need distinct vendors for
  // PARTIALLY_SHIPPED to be a legal state per docs/state-machines.md.
  const vendors = await Promise.all(
    fulfillmentStatuses.map(() => createVendorUser().then(r => r.vendor)),
  )

  for (let i = 0; i < fulfillmentStatuses.length; i += 1) {
    await db.vendorFulfillment.create({
      data: { orderId: order.id, vendorId: vendors[i].id, status: fulfillmentStatuses[i] },
    })
  }
  return order
}

test('recompute: all-CANCELLED fulfillments ⇒ Order.status = CANCELLED (not DELIVERED)', async () => {
  const order = await buildOrderWithFulfillments(['CANCELLED', 'CANCELLED'])
  await recomputeOrderStatus(order.id)
  const r = await db.order.findUniqueOrThrow({ where: { id: order.id } })
  assert.equal(r.status, 'CANCELLED')
})

test('recompute: all DELIVERED ⇒ DELIVERED', async () => {
  const order = await buildOrderWithFulfillments(['DELIVERED', 'DELIVERED'])
  await recomputeOrderStatus(order.id)
  const r = await db.order.findUniqueOrThrow({ where: { id: order.id } })
  assert.equal(r.status, 'DELIVERED')
})

test('recompute: mix DELIVERED + CANCELLED ⇒ DELIVERED (cancelled fulfillment is pass-through)', async () => {
  const order = await buildOrderWithFulfillments(['DELIVERED', 'CANCELLED'])
  await recomputeOrderStatus(order.id)
  const r = await db.order.findUniqueOrThrow({ where: { id: order.id } })
  assert.equal(r.status, 'DELIVERED')
})

test('recompute: mix SHIPPED + PENDING ⇒ PARTIALLY_SHIPPED', async () => {
  const order = await buildOrderWithFulfillments(['SHIPPED', 'PENDING'])
  await recomputeOrderStatus(order.id)
  const r = await db.order.findUniqueOrThrow({ where: { id: order.id } })
  assert.equal(r.status, 'PARTIALLY_SHIPPED')
})

test('recompute: PENDING + CANCELLED only ⇒ no transition (no positive shipped)', async () => {
  const order = await buildOrderWithFulfillments(['PENDING', 'CANCELLED'], 'PAYMENT_CONFIRMED')
  await recomputeOrderStatus(order.id)
  const r = await db.order.findUniqueOrThrow({ where: { id: order.id } })
  assert.equal(r.status, 'PAYMENT_CONFIRMED', 'order must not bump to DELIVERED on partial cancel')
})

test('recompute: refuses to undo CANCELLED (terminal)', async () => {
  const order = await buildOrderWithFulfillments(['SHIPPED'], 'CANCELLED')
  await recomputeOrderStatus(order.id)
  const r = await db.order.findUniqueOrThrow({ where: { id: order.id } })
  assert.equal(r.status, 'CANCELLED', 'CANCELLED is terminal; recompute must not move it')
})

test('recompute: refuses to undo REFUNDED (terminal)', async () => {
  const order = await buildOrderWithFulfillments(['DELIVERED'], 'REFUNDED')
  await recomputeOrderStatus(order.id)
  const r = await db.order.findUniqueOrThrow({ where: { id: order.id } })
  assert.equal(r.status, 'REFUNDED')
})
