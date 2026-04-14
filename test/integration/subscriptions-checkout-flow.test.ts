import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { POST } from '@/app/api/webhooks/stripe/route'
import { createSubscriptionPlan } from '@/domains/subscriptions/actions'
import { startSubscriptionCheckout } from '@/domains/subscriptions/buyer-actions'
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
 * Phase 4b-β end-to-end (mock-mode) coverage of the subscribe flow:
 *   1. buyer starts a Stripe Checkout Session (mock returns a deterministic URL),
 *   2. Stripe fires customer.subscription.created → local Subscription row is upserted,
 *   3. Stripe fires invoice.paid → Order + OrderLine + VendorFulfillment + Payment
 *      are materialized and the subscription's next delivery advances.
 *
 * Real Stripe calls are never made — the adapter detects PAYMENT_PROVIDER=mock
 * and returns synthetic IDs, so the tests can exercise every branch of the
 * webhook handler without mocking out the SDK.
 */

const ADDRESS_INPUT = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  line1: 'Calle Mayor 1',
  city: 'Madrid',
  province: 'Madrid',
  postalCode: '28001',
  country: 'ES',
}

beforeEach(async () => {
  await resetIntegrationDatabase()
  process.env.PAYMENT_PROVIDER = 'mock'
  process.env.SUBSCRIPTIONS_BUYER_BETA = 'true'
  resetServerEnvCache()
})

afterEach(() => {
  clearTestSession()
  process.env.PAYMENT_PROVIDER = 'mock'
  delete process.env.SUBSCRIPTIONS_BUYER_BETA
  resetServerEnvCache()
})

async function setupPlanAndBuyer() {
  const { user: vendorUser, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { basePrice: 24, taxRate: 0.1 })
  useTestSession(buildSession(vendorUser.id, 'VENDOR'))
  const plan = await createSubscriptionPlan({
    productId: product.id,
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 5,
  })

  const buyer = await createUser('CUSTOMER')
  const address = await db.address.create({
    data: { userId: buyer.id, ...ADDRESS_INPUT },
  })
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  return { plan, vendor, product, buyer, address }
}

function subscriptionEventBody(id: string, sub: {
  id: string
  status: string
  planId: string
  buyerId: string
  shippingAddressId: string
}) {
  return JSON.stringify({
    id,
    type: 'customer.subscription.created',
    data: {
      object: {
        id: sub.id,
        status: sub.status,
        customer: `cus_mock_${sub.buyerId}`,
        metadata: {
          marketplacePlanId: sub.planId,
          marketplaceBuyerId: sub.buyerId,
          marketplaceShippingAddressId: sub.shippingAddressId,
        },
      },
    },
  })
}

function invoiceEventBody(
  id: string,
  type: 'invoice.paid' | 'invoice.payment_failed',
  invoice: { id: string; subscription: string; amount_paid: number }
) {
  return JSON.stringify({
    id,
    type,
    data: {
      object: {
        id: invoice.id,
        subscription: invoice.subscription,
        amount_paid: invoice.amount_paid,
        currency: 'eur',
      },
    },
  })
}

test('startSubscriptionCheckout returns a mock Checkout Session URL and persists the Stripe Customer id', async () => {
  const { plan, address, buyer } = await setupPlanAndBuyer()

  const result = await startSubscriptionCheckout({
    planId: plan.id,
    shippingAddressId: address.id,
  })
  assert.ok(result.url.includes('/cuenta/suscripciones'))
  assert.ok(result.url.includes(plan.id))

  const refreshed = await db.user.findUnique({ where: { id: buyer.id } })
  assert.equal(refreshed?.stripeCustomerId, `cus_mock_${buyer.id}`)
})

test('startSubscriptionCheckout refuses when the beta flag is off', async () => {
  process.env.SUBSCRIPTIONS_BUYER_BETA = 'false'
  resetServerEnvCache()
  const { plan, address } = await setupPlanAndBuyer()

  await assert.rejects(
    () =>
      startSubscriptionCheckout({
        planId: plan.id,
        shippingAddressId: address.id,
      }),
    /no están disponibles/i
  )
})

test('customer.subscription.created webhook creates the local Subscription row from the metadata', async () => {
  const { plan, buyer, address } = await setupPlanAndBuyer()

  // No Subscription exists yet
  assert.equal(await db.subscription.count(), 0)

  const response = await POST(
    new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: subscriptionEventBody('evt_sub_created_1', {
        id: 'sub_test_created',
        status: 'active',
        planId: plan.id,
        buyerId: buyer.id,
        shippingAddressId: address.id,
      }),
    }) as any
  )
  assert.equal(response.status, 200)

  const created = await db.subscription.findFirst({
    where: { buyerId: buyer.id, planId: plan.id },
  })
  assert.ok(created)
  assert.equal(created?.stripeSubscriptionId, 'sub_test_created')
  assert.equal(created?.status, 'ACTIVE')
  assert.equal(created?.shippingAddressId, address.id)
})

test('customer.subscription.created is idempotent on replay', async () => {
  const { plan, buyer, address } = await setupPlanAndBuyer()

  for (const evtId of ['evt_sub_created_1', 'evt_sub_created_1']) {
    const response = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: subscriptionEventBody(evtId, {
          id: 'sub_test_idempotent',
          status: 'active',
          planId: plan.id,
          buyerId: buyer.id,
          shippingAddressId: address.id,
        }),
      }) as any
    )
    assert.equal(response.status, 200)
  }
  assert.equal(await db.subscription.count(), 1)
})

test('invoice.paid webhook materializes an Order + OrderLine + VendorFulfillment + Payment', async () => {
  const { plan, vendor, buyer, address } = await setupPlanAndBuyer()

  // Pre-create the local Subscription row (normally done by the
  // customer.subscription.created handler, which we tested separately).
  const sub = await db.subscription.create({
    data: {
      buyerId: buyer.id,
      planId: plan.id,
      shippingAddressId: address.id,
      status: 'ACTIVE',
      nextDeliveryAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      stripeSubscriptionId: 'sub_test_invoice_paid',
    },
  })

  const originalNextDelivery = new Date(sub.nextDeliveryAt)

  const response = await POST(
    new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: invoiceEventBody('evt_invoice_paid_1', 'invoice.paid', {
        id: 'in_test_paid',
        subscription: 'sub_test_invoice_paid',
        amount_paid: 2400,
      }),
    }) as any
  )
  assert.equal(response.status, 200)

  const orders = await db.order.findMany({
    where: { customerId: buyer.id },
    include: { lines: true, fulfillments: true, payments: true, events: true },
  })
  assert.equal(orders.length, 1)
  const order = orders[0]
  assert.equal(order.status, 'PAYMENT_CONFIRMED')
  assert.equal(order.paymentStatus, 'SUCCEEDED')
  assert.equal(Number(order.subtotal), 24)
  assert.equal(order.lines.length, 1)
  assert.equal(order.lines[0].vendorId, vendor.id)
  assert.equal(order.fulfillments.length, 1)
  assert.equal(order.fulfillments[0].vendorId, vendor.id)
  assert.equal(order.payments.length, 1)
  assert.equal(order.payments[0].providerRef, 'in_test_paid')
  assert.equal(order.payments[0].status, 'SUCCEEDED')
  assert.ok(order.events.some(e => e.type === 'SUBSCRIPTION_RENEWAL_CHARGED'))

  // Subscription advanced to the next cycle
  const updatedSub = await db.subscription.findUnique({ where: { id: sub.id } })
  assert.ok(
    updatedSub!.nextDeliveryAt.getTime() >
      originalNextDelivery.getTime()
  )
})

test('invoice.paid replay does not create a second Order for the same invoice id', async () => {
  const { plan, buyer, address } = await setupPlanAndBuyer()
  await db.subscription.create({
    data: {
      buyerId: buyer.id,
      planId: plan.id,
      shippingAddressId: address.id,
      status: 'ACTIVE',
      nextDeliveryAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      stripeSubscriptionId: 'sub_test_replay',
    },
  })

  for (const evtId of ['evt_paid_1', 'evt_paid_2']) {
    const response = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: invoiceEventBody(evtId, 'invoice.paid', {
          id: 'in_test_replay',
          subscription: 'sub_test_replay',
          amount_paid: 2400,
        }),
      }) as any
    )
    assert.equal(response.status, 200)
  }

  const orderCount = await db.order.count({ where: { customerId: buyer.id } })
  assert.equal(orderCount, 1)
})

test('invoice.payment_failed webhook marks the subscription PAST_DUE', async () => {
  const { plan, buyer, address } = await setupPlanAndBuyer()
  const sub = await db.subscription.create({
    data: {
      buyerId: buyer.id,
      planId: plan.id,
      shippingAddressId: address.id,
      status: 'ACTIVE',
      nextDeliveryAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      stripeSubscriptionId: 'sub_test_failed',
    },
  })

  const response = await POST(
    new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: invoiceEventBody('evt_paid_failed', 'invoice.payment_failed', {
        id: 'in_test_failed',
        subscription: 'sub_test_failed',
        amount_paid: 0,
      }),
    }) as any
  )
  assert.equal(response.status, 200)

  const updated = await db.subscription.findUnique({ where: { id: sub.id } })
  assert.equal(updated?.status, 'PAST_DUE')
})
