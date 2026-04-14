import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { POST } from '@/app/api/webhooks/stripe/route'
import { createSubscriptionPlan } from '@/domains/subscriptions/actions'
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
 * Phase 4b-α of the promotions & subscriptions RFC. Verifies
 *   (a) plan creation provisions a Stripe Price (mock IDs in mock mode),
 *   (b) webhook handler idempotently syncs local Subscription rows
 *       when Stripe fires customer.subscription.* events on an id we
 *       already know, and
 *   (c) subscription events whose id is not in our DB are a no-op and
 *       return 200 — the handler must not crash.
 *
 * Stripe Customer + Checkout Session creation, the public subscribe CTA,
 * and invoice.paid → Order materialization live in phase 4b-β and are
 * explicitly out of scope here.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
  process.env.PAYMENT_PROVIDER = 'mock'
  resetServerEnvCache()
})

afterEach(() => {
  clearTestSession()
  process.env.PAYMENT_PROVIDER = 'mock'
  resetServerEnvCache()
})

test('createSubscriptionPlan provisions a mock Stripe Price id in mock mode', async () => {
  const { user, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { basePrice: 27.5 })
  useTestSession(buildSession(user.id, 'VENDOR'))

  const plan = await createSubscriptionPlan({
    productId: product.id,
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 5,
  })

  assert.ok(plan.stripePriceId)
  assert.equal(plan.stripePriceId, `price_mock_${plan.id}`)
})

test('createSubscriptionPlan leaves no orphan plan row if Stripe provisioning throws', async () => {
  // We force an exception by making `provisionPlanPrice` receive a
  // non-finite price. Mock mode happily returns an id anyway, so the
  // cleanest way to simulate a failure from outside the module is to
  // flip the env to 'stripe' without a secret key — the adapter will
  // blow up trying to construct the Stripe client inside the module.
  //
  // We do this *after* the action validates its schema, so we keep
  // PAYMENT_PROVIDER='stripe' and stripeSecretKey empty; the env parser
  // will reject that, so we patch process.env directly AFTER creating
  // the vendor + product (which uses the server env too).
  const { user, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { basePrice: 10 })
  useTestSession(buildSession(user.id, 'VENDOR'))

  process.env.PAYMENT_PROVIDER = 'stripe'
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy'
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy'
  resetServerEnvCache()

  await assert.rejects(
    () =>
      createSubscriptionPlan({
        productId: product.id,
        cadence: 'WEEKLY',
        cutoffDayOfWeek: 5,
      }),
    /proveedor de pagos/i
  )

  const orphanCount = await db.subscriptionPlan.count({
    where: { vendorId: vendor.id },
  })
  assert.equal(orphanCount, 0)
})

test('webhook customer.subscription.updated syncs an existing Subscription to PAST_DUE', async () => {
  const { user: vendorUser, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { basePrice: 20 })
  useTestSession(buildSession(vendorUser.id, 'VENDOR'))
  const plan = await createSubscriptionPlan({
    productId: product.id,
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 5,
  })

  const buyer = await createUser('CUSTOMER')
  const address = await db.address.create({
    data: {
      userId: buyer.id,
      firstName: 'Ada',
      lastName: 'Lovelace',
      line1: 'Calle Mayor 1',
      city: 'Madrid',
      province: 'Madrid',
      postalCode: '28001',
      country: 'ES',
    },
  })

  // Seed the Subscription row directly — the public subscribe flow
  // doesn't land until phase 4b-β. The stripeSubscriptionId is the
  // link Stripe will use in every future webhook for this sub.
  const sub = await db.subscription.create({
    data: {
      buyerId: buyer.id,
      planId: plan.id,
      shippingAddressId: address.id,
      status: 'ACTIVE',
      nextDeliveryAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      stripeSubscriptionId: 'sub_test_past_due',
    },
  })

  const response = await POST(
    new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'evt_past_due_1',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_past_due',
            status: 'past_due',
          },
        },
      }),
    }) as any
  )
  assert.equal(response.status, 200)

  const updated = await db.subscription.findUnique({ where: { id: sub.id } })
  assert.equal(updated?.status, 'PAST_DUE')

  // Idempotent: replaying the same event must leave the state unchanged.
  const replay = await POST(
    new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'evt_past_due_1',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_past_due',
            status: 'past_due',
          },
        },
      }),
    }) as any
  )
  assert.equal(replay.status, 200)
  const stillPastDue = await db.subscription.findUnique({ where: { id: sub.id } })
  assert.equal(stillPastDue?.status, 'PAST_DUE')
})

test('webhook customer.subscription.updated collapses active + pause_collection into PAUSED', async () => {
  const { user: vendorUser, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { basePrice: 20 })
  useTestSession(buildSession(vendorUser.id, 'VENDOR'))
  const plan = await createSubscriptionPlan({
    productId: product.id,
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 5,
  })

  const buyer = await createUser('CUSTOMER')
  const address = await db.address.create({
    data: {
      userId: buyer.id,
      firstName: 'Pause',
      lastName: 'Tester',
      line1: 'Calle Mayor 1',
      city: 'Madrid',
      province: 'Madrid',
      postalCode: '28001',
      country: 'ES',
    },
  })
  const sub = await db.subscription.create({
    data: {
      buyerId: buyer.id,
      planId: plan.id,
      shippingAddressId: address.id,
      status: 'ACTIVE',
      nextDeliveryAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      stripeSubscriptionId: 'sub_test_pause',
    },
  })

  const response = await POST(
    new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'evt_pause_1',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_pause',
            status: 'active',
            pause_collection: { behavior: 'void' },
          },
        },
      }),
    }) as any
  )
  assert.equal(response.status, 200)

  const updated = await db.subscription.findUnique({ where: { id: sub.id } })
  assert.equal(updated?.status, 'PAUSED')
})

test('webhook customer.subscription.deleted marks the local row CANCELED + stamps canceledAt', async () => {
  const { user: vendorUser, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { basePrice: 20 })
  useTestSession(buildSession(vendorUser.id, 'VENDOR'))
  const plan = await createSubscriptionPlan({
    productId: product.id,
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 5,
  })

  const buyer = await createUser('CUSTOMER')
  const address = await db.address.create({
    data: {
      userId: buyer.id,
      firstName: 'Cancel',
      lastName: 'Tester',
      line1: 'Calle Mayor 1',
      city: 'Madrid',
      province: 'Madrid',
      postalCode: '28001',
      country: 'ES',
    },
  })
  const sub = await db.subscription.create({
    data: {
      buyerId: buyer.id,
      planId: plan.id,
      shippingAddressId: address.id,
      status: 'ACTIVE',
      nextDeliveryAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      stripeSubscriptionId: 'sub_test_delete',
    },
  })

  const response = await POST(
    new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'evt_delete_1',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_test_delete',
            status: 'canceled',
            canceled_at: Math.floor(Date.now() / 1000),
          },
        },
      }),
    }) as any
  )
  assert.equal(response.status, 200)

  const updated = await db.subscription.findUnique({ where: { id: sub.id } })
  assert.equal(updated?.status, 'CANCELED')
  assert.ok(updated?.canceledAt)
})

test('webhook customer.subscription.updated is a 200 no-op when the subscription id is unknown', async () => {
  const response = await POST(
    new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'evt_ghost_1',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_never_seen',
            status: 'active',
          },
        },
      }),
    }) as any
  )
  assert.equal(response.status, 200)
  // No rows should have been created as a side effect
  assert.equal(await db.subscription.count(), 0)
})

test('webhook logs but does not crash on a malformed subscription payload', async () => {
  const response = await POST(
    new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'evt_malformed',
        type: 'customer.subscription.updated',
        data: { object: { id: 'not_a_sub_id', status: 'active' } },
      }),
    }) as any
  )
  assert.equal(response.status, 200)
})
