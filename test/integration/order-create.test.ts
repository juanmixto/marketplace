import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { confirmOrder, createOrder } from '@/domains/orders/actions'
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

test('createOrder creates order, lines and fulfillments for valid items', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 5 })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  const created = await createOrder(
    [{ productId: product.id, quantity: 2 }],
    {
      address: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        line1: 'Calle Mayor 1',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
      },
      saveAddress: false,
    }
  )

  const order = await db.order.findUnique({
    where: { id: created.orderId },
    include: { lines: true, fulfillments: true, payments: true },
  })

  assert.ok(order)
  assert.equal(order?.lines.length, 1)
  assert.equal(order?.fulfillments.length, 1)
  assert.equal(order?.payments.length, 1)
  assert.equal(order?.paymentStatus, 'PENDING')
})

test('createOrder rejects products without enough stock', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 1 })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  await assert.rejects(
    () => createOrder(
      [{ productId: product.id, quantity: 3 }],
      {
        address: {
          firstName: 'Ada',
          lastName: 'Lovelace',
          line1: 'Calle Mayor 1',
          city: 'Madrid',
          province: 'Madrid',
          postalCode: '28001',
        },
        saveAddress: false,
      }
    ),
    /stock insuficiente/i
  )
})

test('confirmOrder marks payment as succeeded', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 3 })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    {
      address: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        line1: 'Calle Mayor 1',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
      },
      saveAddress: false,
    }
  )

  const payment = await db.payment.findFirst({
    where: { orderId: created.orderId },
  })
  assert.ok(payment?.providerRef)

  await confirmOrder(created.orderId, payment.providerRef)

  const updated = await db.order.findUnique({
    where: { id: created.orderId },
    include: { payments: true },
  })

  assert.equal(updated?.paymentStatus, 'SUCCEEDED')
  assert.equal(updated?.status, 'PAYMENT_CONFIRMED')
  assert.equal(updated?.payments[0]?.status, 'SUCCEEDED')
})
