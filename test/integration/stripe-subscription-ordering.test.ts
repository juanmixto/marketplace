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
 * Issue #417: Stripe does not guarantee webhook delivery order. The
 * subscription/invoice handlers must guard against an older event
 * arriving after a newer one and silently regressing state. This
 * suite drives the same handler with deliberately reversed event
 * timestamps and asserts the final state matches the latest event,
 * not the last-arrived one.
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

async function seedSubscription(stripeSubscriptionId: string) {
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
      firstName: 'Order',
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
      stripeSubscriptionId,
    },
  })
  return { sub, buyer }
}

function postSubscriptionEvent(
  eventId: string,
  type:
    | 'customer.subscription.updated'
    | 'customer.subscription.deleted'
    | 'customer.subscription.created',
  stripeSubscriptionId: string,
  status: string,
  createdSeconds: number,
) {
  const req = new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: eventId,
      type,
      created: createdSeconds,
      data: {
        object: { id: stripeSubscriptionId, status },
      },
    }),
  })
  // The route handler is typed against NextRequest but only uses Web
  // standard Request methods. The cast is safe and matches the pattern
  // used by stripe-webhook.test.ts.
  return POST(req as Parameters<typeof POST>[0])
}

test('newer subscription.deleted (t=20) wins over later-arriving stale subscription.updated (t=10)', async () => {
  const { sub } = await seedSubscription('sub_test_ordering_1')

  // Apply the NEWER event (deleted at t=20) FIRST in arrival order.
  const r1 = await postSubscriptionEvent(
    'evt_del_1',
    'customer.subscription.deleted',
    'sub_test_ordering_1',
    'canceled',
    2_000_000_020,
  )
  assert.equal(r1.status, 200)

  let row = await db.subscription.findUnique({ where: { id: sub.id } })
  assert.equal(row?.status, 'CANCELED')

  // Then the OLDER event (updated active at t=10) arrives — must be dropped.
  const r2 = await postSubscriptionEvent(
    'evt_upd_old',
    'customer.subscription.updated',
    'sub_test_ordering_1',
    'active',
    2_000_000_010,
  )
  assert.equal(r2.status, 200)

  row = await db.subscription.findUnique({ where: { id: sub.id } })
  assert.equal(row?.status, 'CANCELED', 'stale event must NOT resurrect a CANCELED subscription')
})

test('newer subscription.updated(PAST_DUE, t=15) wins over later-arriving stale subscription.created(t=5)', async () => {
  const { sub } = await seedSubscription('sub_test_ordering_2')

  // Newer event first.
  const r1 = await postSubscriptionEvent(
    'evt_upd_pd',
    'customer.subscription.updated',
    'sub_test_ordering_2',
    'past_due',
    2_000_000_015,
  )
  assert.equal(r1.status, 200)
  let row = await db.subscription.findUnique({ where: { id: sub.id } })
  assert.equal(row?.status, 'PAST_DUE')

  // Older "created" event (which the route reroutes to handleSubscriptionSync
  // for known ids) arrives later with status=active and t=5 — must be dropped.
  const r2 = await postSubscriptionEvent(
    'evt_created_old',
    'customer.subscription.created',
    'sub_test_ordering_2',
    'active',
    2_000_000_005,
  )
  assert.equal(r2.status, 200)
  row = await db.subscription.findUnique({ where: { id: sub.id } })
  assert.equal(row?.status, 'PAST_DUE', 'stale created/active must not resurrect')
})

test('exact replay of the same subscription.updated is idempotent and bumps the watermark only', async () => {
  const { sub } = await seedSubscription('sub_test_ordering_3')

  const r1 = await postSubscriptionEvent(
    'evt_pd_1',
    'customer.subscription.updated',
    'sub_test_ordering_3',
    'past_due',
    2_000_000_100,
  )
  assert.equal(r1.status, 200)
  const after1 = await db.subscription.findUnique({ where: { id: sub.id } })
  assert.equal(after1?.status, 'PAST_DUE')
  assert.ok(after1?.lastStripeEventAt)

  const r2 = await postSubscriptionEvent(
    'evt_pd_1',
    'customer.subscription.updated',
    'sub_test_ordering_3',
    'past_due',
    2_000_000_100,
  )
  assert.equal(r2.status, 200)
  const after2 = await db.subscription.findUnique({ where: { id: sub.id } })
  assert.equal(after2?.status, 'PAST_DUE')
  assert.equal(after2?.lastStripeEventAt?.getTime(), after1?.lastStripeEventAt?.getTime())
})

test('happy path: a normal sequence of strictly-increasing events flows through', async () => {
  const { sub } = await seedSubscription('sub_test_ordering_4')

  await postSubscriptionEvent(
    'e1',
    'customer.subscription.updated',
    'sub_test_ordering_4',
    'active',
    2_000_001_000,
  )
  await postSubscriptionEvent(
    'e2',
    'customer.subscription.updated',
    'sub_test_ordering_4',
    'past_due',
    2_000_001_100,
  )
  await postSubscriptionEvent(
    'e3',
    'customer.subscription.deleted',
    'sub_test_ordering_4',
    'canceled',
    2_000_001_200,
  )

  const final = await db.subscription.findUnique({ where: { id: sub.id } })
  assert.equal(final?.status, 'CANCELED')
  assert.equal(final?.lastStripeEventAt?.getTime(), 2_000_001_200_000)
})
