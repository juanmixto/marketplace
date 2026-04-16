import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  subscribeToPlan,
  listMySubscriptions,
  cancelSubscription,
  pauseSubscription,
  rescheduleNextDelivery,
  resumeSubscription,
  skipNextDelivery,
  getMySubscription,
} from '@/domains/subscriptions/buyer-actions'
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
 * Phase 4a of the promotions & subscriptions RFC. Buyer-side subscription
 * lifecycle. Stripe billing lands in phase 4b — until then the mutations
 * are gated by the SUBSCRIPTIONS_BUYER_BETA env flag. These tests flip
 * the flag on for the duration of a single test and reset it afterwards.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
  process.env.SUBSCRIPTIONS_BUYER_BETA = 'true'
  resetServerEnvCache()
})

afterEach(() => {
  clearTestSession()
  delete process.env.SUBSCRIPTIONS_BUYER_BETA
  resetServerEnvCache()
})

async function createBuyerWithAddress() {
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
  return { buyer, address }
}

async function createPlan(opts: { cadence?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' } = {}) {
  const { user: vendorUser, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { basePrice: 24, taxRate: 0.1 })
  useTestSession(buildSession(vendorUser.id, 'VENDOR'))
  const plan = await createSubscriptionPlan({
    productId: product.id,
    cadence: opts.cadence ?? 'WEEKLY',
    cutoffDayOfWeek: 5,
  })
  return { plan, vendor, product }
}

test('subscribeToPlan creates a row with computed delivery window and snapshot from the plan', async () => {
  const { plan } = await createPlan()
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))

  const sub = await subscribeToPlan({
    planId: plan.id,
    shippingAddressId: address.id,
  })
  assert.equal(sub.buyerId, buyer.id)
  assert.equal(sub.planId, plan.id)
  assert.equal(sub.status, 'ACTIVE')
  assert.equal(sub.shippingAddressId, address.id)
  assert.ok(sub.nextDeliveryAt.getTime() > Date.now())
  assert.ok(sub.currentPeriodEnd.getTime() > sub.nextDeliveryAt.getTime())
})

test('subscribeToPlan refuses when the beta flag is off', async () => {
  process.env.SUBSCRIPTIONS_BUYER_BETA = 'false'
  resetServerEnvCache()

  const { plan } = await createPlan()
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))

  await assert.rejects(
    () => subscribeToPlan({ planId: plan.id, shippingAddressId: address.id }),
    /no están disponibles/i
  )
})

test('subscribeToPlan rejects an archived plan', async () => {
  const { plan } = await createPlan()
  await db.subscriptionPlan.update({
    where: { id: plan.id },
    data: { archivedAt: new Date() },
  })
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))

  await assert.rejects(
    () => subscribeToPlan({ planId: plan.id, shippingAddressId: address.id }),
    /no encontrado/i
  )
})

test('subscribeToPlan rejects a foreign buyer address', async () => {
  const { plan } = await createPlan()
  const { buyer } = await createBuyerWithAddress()
  const otherBuyer = await createUser('CUSTOMER')
  const foreignAddress = await db.address.create({
    data: {
      userId: otherBuyer.id,
      firstName: 'Foreign',
      lastName: 'Tester',
      line1: 'Rue de Foreign 2',
      city: 'Paris',
      province: 'Madrid',
      postalCode: '28001',
      country: 'ES',
    },
  })
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))

  await assert.rejects(
    () =>
      subscribeToPlan({
        planId: plan.id,
        shippingAddressId: foreignAddress.id,
      }),
    /dirección/i
  )
})

test('subscribeToPlan enforces one active subscription per (buyer, plan)', async () => {
  const { plan } = await createPlan()
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))

  await subscribeToPlan({ planId: plan.id, shippingAddressId: address.id })
  await assert.rejects(
    () => subscribeToPlan({ planId: plan.id, shippingAddressId: address.id }),
    /ya estás suscrito/i
  )
})

test('cancelSubscription sets status + canceledAt and is idempotent', async () => {
  const { plan } = await createPlan()
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))

  const sub = await subscribeToPlan({ planId: plan.id, shippingAddressId: address.id })
  const first = await cancelSubscription(sub.id)
  assert.equal(first.status, 'CANCELED')
  assert.ok(first.canceledAt)

  const second = await cancelSubscription(sub.id)
  assert.equal(second.status, 'CANCELED')
})

test('cancelSubscription rejects another buyer’s subscription', async () => {
  const { plan } = await createPlan()
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const sub = await subscribeToPlan({ planId: plan.id, shippingAddressId: address.id })

  const other = await createUser('CUSTOMER')
  useTestSession(buildSession(other.id, 'CUSTOMER'))
  await assert.rejects(() => cancelSubscription(sub.id), /no encontrada/i)
})

test('pauseSubscription + resumeSubscription transition between ACTIVE and PAUSED', async () => {
  const { plan } = await createPlan()
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const sub = await subscribeToPlan({ planId: plan.id, shippingAddressId: address.id })

  const paused = await pauseSubscription(sub.id)
  assert.equal(paused.status, 'PAUSED')

  const resumed = await resumeSubscription(sub.id)
  assert.equal(resumed.status, 'ACTIVE')
  // Resume recomputes the next delivery from "now + cadence"
  assert.ok(resumed.nextDeliveryAt.getTime() > Date.now())
})

test('pauseSubscription refuses on a canceled subscription', async () => {
  const { plan } = await createPlan()
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const sub = await subscribeToPlan({ planId: plan.id, shippingAddressId: address.id })
  await cancelSubscription(sub.id)

  await assert.rejects(() => pauseSubscription(sub.id), /pausar/i)
})

test('resumeSubscription refuses on an already ACTIVE subscription', async () => {
  const { plan } = await createPlan()
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const sub = await subscribeToPlan({ planId: plan.id, shippingAddressId: address.id })

  await assert.rejects(() => resumeSubscription(sub.id), /pausada/i)
})

test('skipNextDelivery appends to skippedDeliveries and advances nextDeliveryAt', async () => {
  const { plan } = await createPlan({ cadence: 'WEEKLY' })
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const sub = await subscribeToPlan({ planId: plan.id, shippingAddressId: address.id })

  const originalDelivery = new Date(sub.nextDeliveryAt)
  const skipped = await skipNextDelivery(sub.id)

  assert.ok(Array.isArray(skipped.skippedDeliveries))
  assert.equal((skipped.skippedDeliveries as unknown[]).length, 1)
  assert.equal(
    (skipped.skippedDeliveries as string[])[0],
    originalDelivery.toISOString().slice(0, 10)
  )
  // Next delivery advanced by 7 days for a weekly cadence
  const deltaMs = skipped.nextDeliveryAt.getTime() - originalDelivery.getTime()
  assert.equal(deltaMs, 7 * 24 * 60 * 60 * 1000)
})

test('skipNextDelivery refuses once the buyer is past the cutoff day for the next delivery', async () => {
  // Force a subscription whose nextDelivery is already past the cutoff.
  const { plan } = await createPlan()
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const sub = await subscribeToPlan({ planId: plan.id, shippingAddressId: address.id })

  // Pull the delivery window to "tomorrow" and set cutoff to yesterday-of-week.
  // Easier: stub the plan's cutoffDayOfWeek to a day that has already passed
  // relative to nextDelivery. To keep the test deterministic, force a
  // nextDeliveryAt exactly 6h ahead and a cutoff that doesn't help.
  const sixHoursAhead = new Date(Date.now() + 6 * 60 * 60 * 1000)
  await db.subscription.update({
    where: { id: sub.id },
    data: { nextDeliveryAt: sixHoursAhead },
  })
  // Pick a cutoff day that's two days before "today" so the cutoff has
  // already passed for the sub's delivery week.
  const twoDaysAgoDow = (new Date().getUTCDay() + 5) % 7
  await db.subscriptionPlan.update({
    where: { id: plan.id },
    data: { cutoffDayOfWeek: twoDaysAgoDow },
  })

  await assert.rejects(() => skipNextDelivery(sub.id), /cierre/i)
})

function ymdInDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

test('rescheduleNextDelivery sets nextDeliveryAt to the chosen date on an ACTIVE sub', async () => {
  const { plan } = await createPlan({ cadence: 'WEEKLY' })
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const sub = await subscribeToPlan({ planId: plan.id, shippingAddressId: address.id })

  // Pick a date 10 days out — inside the [+2d, +60d] window.
  const target = ymdInDays(10)
  const updated = await rescheduleNextDelivery({
    subscriptionId: sub.id,
    nextDeliveryAt: target,
  })

  const updatedYmd = updated.nextDeliveryAt.toISOString().slice(0, 10)
  assert.equal(updatedYmd, target)
})

test('rescheduleNextDelivery rejects a PAUSED subscription', async () => {
  const { plan } = await createPlan()
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const sub = await subscribeToPlan({ planId: plan.id, shippingAddressId: address.id })
  await pauseSubscription(sub.id)

  await assert.rejects(
    () =>
      rescheduleNextDelivery({
        subscriptionId: sub.id,
        nextDeliveryAt: ymdInDays(10),
      }),
    /activa/i,
  )
})

test('rescheduleNextDelivery rejects a CANCELED subscription', async () => {
  const { plan } = await createPlan()
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const sub = await subscribeToPlan({ planId: plan.id, shippingAddressId: address.id })
  await cancelSubscription(sub.id)

  await assert.rejects(
    () =>
      rescheduleNextDelivery({
        subscriptionId: sub.id,
        nextDeliveryAt: ymdInDays(10),
      }),
    /activa/i,
  )
})

test('rescheduleNextDelivery rejects a date less than 2 days away', async () => {
  const { plan } = await createPlan()
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const sub = await subscribeToPlan({ planId: plan.id, shippingAddressId: address.id })

  await assert.rejects(
    () =>
      rescheduleNextDelivery({
        subscriptionId: sub.id,
        // Tomorrow — fails the MIN_LEAD_DAYS guard.
        nextDeliveryAt: ymdInDays(1),
      }),
    /2 días/i,
  )
})

test('rescheduleNextDelivery rejects a date more than 60 days away', async () => {
  const { plan } = await createPlan()
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const sub = await subscribeToPlan({ planId: plan.id, shippingAddressId: address.id })

  await assert.rejects(
    () =>
      rescheduleNextDelivery({
        subscriptionId: sub.id,
        nextDeliveryAt: ymdInDays(90),
      }),
    /60 días/i,
  )
})

test('rescheduleNextDelivery rejects when past the plan cutoff day for the current week', async () => {
  // Same cutoff trick skipNextDelivery uses: force the cutoff to a day
  // that already happened this week.
  const { plan } = await createPlan()
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const sub = await subscribeToPlan({ planId: plan.id, shippingAddressId: address.id })

  const sixHoursAhead = new Date(Date.now() + 6 * 60 * 60 * 1000)
  await db.subscription.update({
    where: { id: sub.id },
    data: { nextDeliveryAt: sixHoursAhead },
  })
  const twoDaysAgoDow = (new Date().getUTCDay() + 5) % 7
  await db.subscriptionPlan.update({
    where: { id: plan.id },
    data: { cutoffDayOfWeek: twoDaysAgoDow },
  })

  await assert.rejects(
    () =>
      rescheduleNextDelivery({
        subscriptionId: sub.id,
        nextDeliveryAt: ymdInDays(10),
      }),
    /cierre/i,
  )
})

test('listMySubscriptions scopes by buyer and filter', async () => {
  const { plan: planA } = await createPlan()
  const { plan: planB } = await createPlan()

  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))

  const active = await subscribeToPlan({ planId: planA.id, shippingAddressId: address.id })
  const toCancel = await subscribeToPlan({ planId: planB.id, shippingAddressId: address.id })
  await cancelSubscription(toCancel.id)

  const all = await listMySubscriptions('all')
  assert.equal(all.length, 2)

  const activeOnly = await listMySubscriptions('active')
  assert.equal(activeOnly.length, 1)
  assert.equal(activeOnly[0].id, active.id)

  const canceledOnly = await listMySubscriptions('canceled')
  assert.equal(canceledOnly.length, 1)
  assert.equal(canceledOnly[0].id, toCancel.id)

  // Different buyer should see nothing
  const other = await createUser('CUSTOMER')
  useTestSession(buildSession(other.id, 'CUSTOMER'))
  assert.equal((await listMySubscriptions('all')).length, 0)
})

test('getMySubscription returns null for another buyer’s subscription', async () => {
  const { plan } = await createPlan()
  const { buyer, address } = await createBuyerWithAddress()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const sub = await subscribeToPlan({ planId: plan.id, shippingAddressId: address.id })

  const other = await createUser('CUSTOMER')
  useTestSession(buildSession(other.id, 'CUSTOMER'))
  assert.equal(await getMySubscription(sub.id), null)
})
