import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { advanceFulfillment } from '@/domains/vendors/actions'
import { cancelOrder } from '@/domains/admin/actions'
import { db } from '@/lib/db'
import {
  buildSession,
  clearTestSession,
  createActiveProduct,
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

async function createMultiVendorOrder() {
  const firstVendor = await createVendorUser()
  const secondVendor = await createVendorUser()
  const customer = await createUser('CUSTOMER')

  const firstProduct = await createActiveProduct(firstVendor.vendor.id, { stock: 5 })
  const secondProduct = await createActiveProduct(secondVendor.vendor.id, { stock: 5 })

  const order = await db.order.create({
    data: {
      orderNumber: `MKP-STATE-${Date.now()}`,
      customerId: customer.id,
      subtotal: 24,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 24,
      status: 'PROCESSING',
      paymentStatus: 'SUCCEEDED',
      lines: {
        create: [
          {
            productId: firstProduct.id,
            vendorId: firstVendor.vendor.id,
            quantity: 1,
            unitPrice: 12,
            taxRate: 0.1,
            productSnapshot: {
              id: firstProduct.id,
              name: firstProduct.name,
              slug: firstProduct.slug,
              images: firstProduct.images,
              unit: firstProduct.unit,
              vendorName: firstVendor.vendor.displayName,
            },
          },
          {
            productId: secondProduct.id,
            vendorId: secondVendor.vendor.id,
            quantity: 1,
            unitPrice: 12,
            taxRate: 0.1,
            productSnapshot: {
              id: secondProduct.id,
              name: secondProduct.name,
              slug: secondProduct.slug,
              images: secondProduct.images,
              unit: secondProduct.unit,
              vendorName: secondVendor.vendor.displayName,
            },
          },
        ],
      },
      fulfillments: {
        create: [
          { vendorId: firstVendor.vendor.id, status: 'READY' },
          { vendorId: secondVendor.vendor.id, status: 'READY' },
        ],
      },
    },
    include: {
      fulfillments: true,
      lines: true,
    },
  })

  await db.product.update({
    where: { id: firstProduct.id },
    data: { stock: { decrement: 1 } },
  })

  await db.product.update({
    where: { id: secondProduct.id },
    data: { stock: { decrement: 1 } },
  })

  return { order, firstVendor, secondVendor, firstProduct, secondProduct }
}

test('shipping one of two vendor fulfillments sets the order to PARTIALLY_SHIPPED', async () => {
  const { order, firstVendor } = await createMultiVendorOrder()
  const firstFulfillment = order.fulfillments.find(fulfillment => fulfillment.vendorId === firstVendor.vendor.id)
  assert.ok(firstFulfillment)

  useTestSession(buildSession(firstVendor.user.id, 'VENDOR'))
  await advanceFulfillment(firstFulfillment.id, 'TRACK-1', 'Correos')

  const updatedOrder = await db.order.findUnique({ where: { id: order.id } })
  assert.equal(updatedOrder?.status, 'PARTIALLY_SHIPPED')
})

test('shipping all vendor fulfillments sets the order to SHIPPED', async () => {
  const { order, firstVendor, secondVendor } = await createMultiVendorOrder()
  const firstFulfillment = order.fulfillments.find(fulfillment => fulfillment.vendorId === firstVendor.vendor.id)
  const secondFulfillment = order.fulfillments.find(fulfillment => fulfillment.vendorId === secondVendor.vendor.id)
  assert.ok(firstFulfillment)
  assert.ok(secondFulfillment)

  useTestSession(buildSession(firstVendor.user.id, 'VENDOR'))
  await advanceFulfillment(firstFulfillment.id, 'TRACK-1', 'Correos')

  useTestSession(buildSession(secondVendor.user.id, 'VENDOR'))
  await advanceFulfillment(secondFulfillment.id, 'TRACK-2', 'SEUR')

  const updatedOrder = await db.order.findUnique({ where: { id: order.id } })
  assert.equal(updatedOrder?.status, 'SHIPPED')
})

test('cancelOrder cascades active fulfillments to CANCELLED and restores stock', async () => {
  const admin = await createUser('ADMIN_OPS')
  const { order, firstProduct, secondProduct } = await createMultiVendorOrder()

  const beforeFirst = await db.product.findUniqueOrThrow({ where: { id: firstProduct.id } })
  const beforeSecond = await db.product.findUniqueOrThrow({ where: { id: secondProduct.id } })

  useTestSession(buildSession(admin.id, 'ADMIN_OPS'))
  await cancelOrder(order.id, 'Cliente solicita cancelación')

  const cancelledOrder = await db.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { fulfillments: true },
  })
  const restoredFirst = await db.product.findUniqueOrThrow({ where: { id: firstProduct.id } })
  const restoredSecond = await db.product.findUniqueOrThrow({ where: { id: secondProduct.id } })

  assert.equal(cancelledOrder.status, 'CANCELLED')
  assert.deepEqual(cancelledOrder.fulfillments.map(fulfillment => fulfillment.status), ['CANCELLED', 'CANCELLED'])
  assert.equal(restoredFirst.stock, beforeFirst.stock + 1)
  assert.equal(restoredSecond.stock, beforeSecond.stock + 1)
})

test('cancelOrder keeps shipped fulfillments untouched while cancelling the rest', async () => {
  const admin = await createUser('ADMIN_OPS')
  const { order, firstVendor, firstProduct, secondProduct } = await createMultiVendorOrder()
  const firstFulfillment = order.fulfillments.find(fulfillment => fulfillment.vendorId === firstVendor.vendor.id)
  assert.ok(firstFulfillment)

  useTestSession(buildSession(firstVendor.user.id, 'VENDOR'))
  await advanceFulfillment(firstFulfillment.id, 'TRACK-1', 'Correos')

  useTestSession(buildSession(admin.id, 'ADMIN_OPS'))
  await cancelOrder(order.id, 'Solo queda un envío pendiente')

  const cancelledOrder = await db.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { fulfillments: { orderBy: { vendorId: 'asc' } } },
  })
  const restoredFirst = await db.product.findUniqueOrThrow({ where: { id: firstProduct.id } })
  const restoredSecond = await db.product.findUniqueOrThrow({ where: { id: secondProduct.id } })

  assert.equal(cancelledOrder.status, 'CANCELLED')
  assert.equal(cancelledOrder.fulfillments.filter(fulfillment => fulfillment.status === 'SHIPPED').length, 1)
  assert.equal(cancelledOrder.fulfillments.filter(fulfillment => fulfillment.status === 'CANCELLED').length, 1)
  assert.equal(restoredFirst.stock, 4)
  assert.equal(restoredSecond.stock, 5)
})
