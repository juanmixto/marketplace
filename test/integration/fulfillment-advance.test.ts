import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { advanceFulfillment } from '@/domains/vendors/actions'
import { db } from '@/lib/db'
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

async function createFulfillment(status: 'PENDING' | 'CONFIRMED' | 'SHIPPED' = 'PENDING') {
  const { user, vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const order = await db.order.create({
    data: {
      orderNumber: `MKP-FULL-${status}`,
      customerId: customer.id,
      subtotal: 10,
      shippingCost: 0,
      taxAmount: 0.91,
      grandTotal: 10,
      status: 'PAYMENT_CONFIRMED',
      paymentStatus: 'SUCCEEDED',
    },
  })

  const fulfillment = await db.vendorFulfillment.create({
    data: {
      orderId: order.id,
      vendorId: vendor.id,
      status,
    },
  })

  return { user, vendor, fulfillment }
}

test('advanceFulfillment transitions pending to confirmed', async () => {
  const { user, fulfillment } = await createFulfillment('PENDING')
  useTestSession(buildSession(user.id, 'VENDOR'))

  await advanceFulfillment(fulfillment.id)

  const updated = await db.vendorFulfillment.findUnique({ where: { id: fulfillment.id } })
  assert.equal(updated?.status, 'CONFIRMED')
})

test('advanceFulfillment can move confirmed fulfillments forward twice', async () => {
  const { user, fulfillment } = await createFulfillment('CONFIRMED')
  useTestSession(buildSession(user.id, 'VENDOR'))

  await advanceFulfillment(fulfillment.id)
  let updated = await db.vendorFulfillment.findUnique({ where: { id: fulfillment.id } })
  assert.equal(updated?.status, 'PREPARING')

  await advanceFulfillment(fulfillment.id)
  updated = await db.vendorFulfillment.findUnique({ where: { id: fulfillment.id } })
  assert.equal(updated?.status, 'READY')
})

test('advanceFulfillment rejects terminal shipped fulfillments', async () => {
  const { user, fulfillment } = await createFulfillment('SHIPPED')
  useTestSession(buildSession(user.id, 'VENDOR'))

  await assert.rejects(() => advanceFulfillment(fulfillment.id), /no se puede avanzar/i)
})
