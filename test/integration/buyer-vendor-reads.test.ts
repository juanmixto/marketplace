import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  getMyOrders,
  getOrderDetail,
} from '@/domains/orders/actions'
import {
  getMyProducts,
  getMyProduct,
  getMyVendorProfile,
} from '@/domains/vendors/actions'
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

// ─── orders / buyer reads ───────────────────────────────────────────────────

test('getMyOrders returns [] for unauthenticated callers', async () => {
  // No useTestSession() — caller is anonymous.
  const orders = await getMyOrders()
  assert.deepEqual(orders, [])
})

test('getMyOrders returns only the authenticated buyers orders', async () => {
  const customerA = await createUser('CUSTOMER')
  const customerB = await createUser('CUSTOMER')

  await db.order.create({
    data: {
      orderNumber: 'TEST-A-1',
      customerId: customerA.id,
      status: 'DELIVERED',
      paymentStatus: 'SUCCEEDED',
      subtotal: 10,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 10,
    },
  })
  await db.order.create({
    data: {
      orderNumber: 'TEST-B-1',
      customerId: customerB.id,
      status: 'DELIVERED',
      paymentStatus: 'SUCCEEDED',
      subtotal: 20,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 20,
    },
  })

  useTestSession(buildSession(customerA.id, 'CUSTOMER'))
  const ordersForA = await getMyOrders()
  assert.equal(ordersForA.length, 1)
  assert.equal(ordersForA[0].orderNumber, 'TEST-A-1')
})

test('getOrderDetail returns null for unauthenticated callers', async () => {
  const result = await getOrderDetail('any-id')
  assert.equal(result, null)
})

test('getOrderDetail returns null when the order belongs to someone else', async () => {
  const customerA = await createUser('CUSTOMER')
  const customerB = await createUser('CUSTOMER')

  const orderForA = await db.order.create({
    data: {
      orderNumber: 'TEST-A-2',
      customerId: customerA.id,
      status: 'DELIVERED',
      paymentStatus: 'SUCCEEDED',
      subtotal: 10,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 10,
    },
  })

  useTestSession(buildSession(customerB.id, 'CUSTOMER'))
  const result = await getOrderDetail(orderForA.id)
  assert.equal(result, null, 'cross-tenant read must not leak')
})

test('getOrderDetail returns the order and its lines for the owner', async () => {
  const customer = await createUser('CUSTOMER')
  const order = await db.order.create({
    data: {
      orderNumber: 'TEST-OWNED',
      customerId: customer.id,
      status: 'DELIVERED',
      paymentStatus: 'SUCCEEDED',
      subtotal: 10,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 10,
    },
  })

  useTestSession(buildSession(customer.id, 'CUSTOMER'))
  const result = await getOrderDetail(order.id)
  assert.ok(result)
  assert.equal(result?.orderNumber, 'TEST-OWNED')
})

// ─── vendor reads ───────────────────────────────────────────────────────────

test('getMyVendorProfile returns the authenticated vendors profile', async () => {
  const { user, vendor } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const profile = await getMyVendorProfile()
  assert.ok(profile)
  assert.equal(profile?.id, vendor.id)
})

test('getMyProducts returns only products belonging to the authenticated vendor', async () => {
  const vendorA = await createVendorUser()
  const vendorB = await createVendorUser()
  await createActiveProduct(vendorA.vendor.id, { stock: 5 })
  await createActiveProduct(vendorA.vendor.id, { stock: 5, slug: 'a-second' })
  await createActiveProduct(vendorB.vendor.id, { stock: 5, slug: 'b-only' })

  useTestSession(buildSession(vendorA.user.id, 'VENDOR'))
  const productsForA = await getMyProducts()
  assert.equal(productsForA.length, 2)
  assert.ok(productsForA.every(product => product.vendorId === vendorA.vendor.id))
})

test('getMyProduct returns null when the product belongs to a different vendor', async () => {
  const vendorA = await createVendorUser()
  const vendorB = await createVendorUser()
  const productOfB = await createActiveProduct(vendorB.vendor.id, { stock: 5 })

  useTestSession(buildSession(vendorA.user.id, 'VENDOR'))
  const result = await getMyProduct(productOfB.id)
  assert.equal(result, null, 'cross-tenant vendor read must not leak')
})

test('getMyProduct returns the product when it belongs to the caller', async () => {
  const { user, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { stock: 5 })

  useTestSession(buildSession(user.id, 'VENDOR'))
  const result = await getMyProduct(product.id)
  assert.ok(result)
  assert.equal(result?.id, product.id)
})
