import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { getOrderDetail, getMyOrders, confirmOrder } from '@/domains/orders/actions'
import { advanceFulfillment } from '@/domains/vendors/actions'
import { getAdminOrdersPageData } from '@/domains/admin/orders'
import { getProducersOverview } from '@/domains/admin/producers'
import { getPromotionsOverview } from '@/domains/admin/promotions'
import { getSubscriptionsOverview } from '@/domains/admin/subscriptions'
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
  // Force test mode for the auth-guard helpers, which honor
  // globalThis.__testActionSession only when NODE_ENV === 'test'.
  Object.assign(process.env, { NODE_ENV: 'test' })
})

afterEach(() => {
  clearTestSession()
})

async function createOrderFor(customerId: string, vendorId?: string) {
  return db.order.create({
    data: {
      orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId,
      status: 'PLACED',
      paymentStatus: 'PENDING',
      subtotal: 10,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 10,
      ...(vendorId && {
        fulfillments: { create: { vendorId, status: 'CONFIRMED' } },
      }),
    },
    include: { fulfillments: true },
  })
}

test('getOrderDetail returns null when buyer B asks for buyer A order', async () => {
  const buyerA = await createUser('CUSTOMER')
  const buyerB = await createUser('CUSTOMER')
  const orderA = await createOrderFor(buyerA.id)

  useTestSession(buildSession(buyerB.id, 'CUSTOMER'))
  const result = await getOrderDetail(orderA.id)
  assert.equal(result, null)
})

test('getMyOrders returns only the calling buyer orders', async () => {
  const buyerA = await createUser('CUSTOMER')
  const buyerB = await createUser('CUSTOMER')
  await createOrderFor(buyerA.id)
  const ownB = await createOrderFor(buyerB.id)

  useTestSession(buildSession(buyerB.id, 'CUSTOMER'))
  const orders = await getMyOrders()
  assert.equal(orders.length, 1)
  assert.equal(orders[0].id, ownB.id)
})

test('confirmOrder rejects buyer B trying to confirm buyer A order in mock mode', async () => {
  Object.assign(process.env, { PAYMENT_PROVIDER: 'mock' })
  const buyerA = await createUser('CUSTOMER')
  const buyerB = await createUser('CUSTOMER')
  const orderA = await createOrderFor(buyerA.id)

  // Plant a payment row so the lookup inside confirmOrder finds something.
  await db.payment.create({
    data: {
      orderId: orderA.id,
      provider: 'mock',
      providerRef: 'pi_mock_test',
      amount: 10,
      currency: 'EUR',
      status: 'PENDING',
    },
  })

  useTestSession(buildSession(buyerB.id, 'CUSTOMER'))
  await assert.rejects(
    () => confirmOrder(orderA.id, 'pi_mock_test'),
    /No puedes confirmar un pedido que no te pertenece/i
  )

  const stored = await db.order.findUnique({ where: { id: orderA.id } })
  assert.equal(stored?.paymentStatus, 'PENDING')
})

test('advanceFulfillment rejects vendor B for a fulfillment owned by vendor A', async () => {
  const buyer = await createUser('CUSTOMER')
  const { vendor: vendorA } = await createVendorUser()
  const { user: vendorBUser } = await createVendorUser()
  const order = await createOrderFor(buyer.id, vendorA.id)
  const fulfillmentA = order.fulfillments[0]!

  useTestSession(buildSession(vendorBUser.id, 'VENDOR'))
  await assert.rejects(() => advanceFulfillment(fulfillmentA.id, 'READY'), /no encontrad/i)
  const stored = await db.vendorFulfillment.findUnique({
    where: { id: fulfillmentA.id },
  })
  assert.equal(stored?.status, 'CONFIRMED')
})

test('getAdminOrdersPageData rejects non-admin callers', async () => {
  const buyer = await createUser('CUSTOMER')
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  // requireAdmin redirects on failure; in tests redirect throws a
  // NEXT_REDIRECT error which surfaces as a rejected promise.
  await assert.rejects(() => getAdminOrdersPageData({}), /NEXT_REDIRECT|redirect/i)
})

test('getProducersOverview / getPromotionsOverview / getSubscriptionsOverview reject non-admin callers', async () => {
  const buyer = await createUser('CUSTOMER')
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  await assert.rejects(() => getProducersOverview(), /NEXT_REDIRECT|redirect/i)
  await assert.rejects(() => getPromotionsOverview(), /NEXT_REDIRECT|redirect/i)
  await assert.rejects(() => getSubscriptionsOverview(), /NEXT_REDIRECT|redirect/i)
})

test('admin loaders accept SUPERADMIN sessions', async () => {
  const admin = await db.user.create({
    data: {
      email: `admin-${Date.now()}@example.com`,
      firstName: 'Admin',
      lastName: 'Tester',
      role: 'SUPERADMIN',
      isActive: true,
    },
  })
  useTestSession(buildSession(admin.id, 'SUPERADMIN'))
  const orders = await getAdminOrdersPageData({})
  assert.ok(Array.isArray(orders.orders))
  const producers = await getProducersOverview()
  assert.ok(Array.isArray(producers.pageItems))
  const promos = await getPromotionsOverview()
  assert.ok(Array.isArray(promos.promotions))
  const subs = await getSubscriptionsOverview()
  assert.ok(Array.isArray(subs.plans))
})
