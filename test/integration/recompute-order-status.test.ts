import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { cancelShipmentAction } from '@/domains/shipping/actions'
import {
  buildSession,
  clearTestSession,
  createUser,
  createVendorUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

async function seedOrderWithFulfillments(opts: {
  fulfillments: Array<{ status: 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' }>
  orderStatus?: 'PAYMENT_CONFIRMED' | 'PROCESSING' | 'PARTIALLY_SHIPPED' | 'SHIPPED'
}) {
  const orderStatus = opts.orderStatus ?? 'PAYMENT_CONFIRMED'
  const customer = await createUser('CUSTOMER')
  const order = await db.order.create({
    data: {
      orderNumber: `MKP-REC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId: customer.id,
      subtotal: 10,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 10,
      status: orderStatus,
      paymentStatus: 'SUCCEEDED',
    },
  })

  const fulfillments: Array<{
    id: string
    vendorUserId: string
  }> = []
  for (const fSpec of opts.fulfillments) {
    const { user, vendor } = await createVendorUser()
    const f = await db.vendorFulfillment.create({
      data: {
        orderId: order.id,
        vendorId: vendor.id,
        status: fSpec.status,
      },
    })
    fulfillments.push({ id: f.id, vendorUserId: user.id })
  }

  return { order, fulfillments }
}

test('vendor-side cancel of the only fulfillment flips Order to CANCELLED', async () => {
  const { order, fulfillments } = await seedOrderWithFulfillments({
    fulfillments: [{ status: 'CONFIRMED' }],
  })
  useTestSession(buildSession(fulfillments[0].vendorUserId, 'VENDOR'))

  const result = await cancelShipmentAction(fulfillments[0].id)
  assert.equal(result.ok, true)

  const refreshed = await db.order.findUnique({ where: { id: order.id } })
  assert.equal(refreshed?.status, 'CANCELLED')
})

test('vendor-side cancel of one of two leaves Order in its prior state', async () => {
  const { order, fulfillments } = await seedOrderWithFulfillments({
    fulfillments: [{ status: 'CONFIRMED' }, { status: 'CONFIRMED' }],
  })
  useTestSession(buildSession(fulfillments[0].vendorUserId, 'VENDOR'))

  const result = await cancelShipmentAction(fulfillments[0].id)
  assert.equal(result.ok, true)

  const refreshed = await db.order.findUnique({ where: { id: order.id } })
  assert.equal(refreshed?.status, 'PAYMENT_CONFIRMED')
})

test('cancel of last open fulfillment when its sibling is SHIPPED leaves Order at SHIPPED', async () => {
  const { order, fulfillments } = await seedOrderWithFulfillments({
    fulfillments: [{ status: 'SHIPPED' }, { status: 'CONFIRMED' }],
    orderStatus: 'PARTIALLY_SHIPPED',
  })
  useTestSession(buildSession(fulfillments[1].vendorUserId, 'VENDOR'))

  const result = await cancelShipmentAction(fulfillments[1].id)
  assert.equal(result.ok, true)

  const refreshed = await db.order.findUnique({ where: { id: order.id } })
  // One SHIPPED + one CANCELLED → all non-cancelled are shipped → SHIPPED.
  assert.equal(refreshed?.status, 'SHIPPED')
})

test('cancel does not flip an already-CANCELLED order back to anything else', async () => {
  // Seed an Order already in CANCELLED with a CONFIRMED fulfillment.
  const customer = await createUser('CUSTOMER')
  const { user, vendor } = await createVendorUser()
  const order = await db.order.create({
    data: {
      orderNumber: `MKP-REC-TERM-${Date.now()}`,
      customerId: customer.id,
      subtotal: 10,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 10,
      status: 'CANCELLED',
      paymentStatus: 'FAILED',
    },
  })
  const fulfillment = await db.vendorFulfillment.create({
    data: { orderId: order.id, vendorId: vendor.id, status: 'CONFIRMED' },
  })
  useTestSession(buildSession(user.id, 'VENDOR'))

  const result = await cancelShipmentAction(fulfillment.id)
  assert.equal(result.ok, true)

  const refreshed = await db.order.findUnique({ where: { id: order.id } })
  assert.equal(refreshed?.status, 'CANCELLED')
})
