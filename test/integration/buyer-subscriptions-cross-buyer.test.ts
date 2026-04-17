import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  subscribeToPlan,
  pauseSubscription,
  resumeSubscription,
  skipNextDelivery,
  rescheduleNextDelivery,
  startSubscriptionCheckout,
  confirmMockSubscriptionCheckout,
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
 * Cross-buyer security audit (#402 / parent #310).
 *
 * These tests enforce that every buyer-facing subscription action scopes
 * the subscription by `buyerId = session.user.id`. A buyer must never be
 * able to mutate another buyer's subscription by guessing or observing
 * their subscription id, address id, or plan id.
 *
 * The existing `buyer-subscriptions.test.ts` covers the happy path and
 * some cross-buyer cases (cancel, getMySubscription, subscribeToPlan
 * foreign address). This file completes the matrix for pause, resume,
 * skipNextDelivery, rescheduleNextDelivery, startSubscriptionCheckout
 * and confirmMockSubscriptionCheckout.
 *
 * Regression bar: every action that takes a subscription id or address
 * id in its input MUST surface a "not found" style error when the
 * caller's buyerId does not match the row's buyerId. `findFirst({id,
 * buyerId})` + `throw` in `loadOwnedSubscription` is the current
 * enforcement point; these tests pin that behaviour so a future
 * refactor cannot silently downgrade it to `findUnique({id})`.
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

async function createBuyerWithAddress(labelSuffix = '') {
  const buyer = await createUser('CUSTOMER')
  const address = await db.address.create({
    data: {
      userId: buyer.id,
      firstName: `Buyer${labelSuffix}`,
      lastName: 'Tester',
      line1: 'Calle Mayor 1',
      city: 'Madrid',
      province: 'Madrid',
      postalCode: '28001',
      country: 'ES',
    },
  })
  return { buyer, address }
}

async function createPlan() {
  const { user: vendorUser, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { basePrice: 24, taxRate: 0.1 })
  useTestSession(buildSession(vendorUser.id, 'VENDOR'))
  const plan = await createSubscriptionPlan({
    productId: product.id,
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 5,
  })
  return { plan, vendor, product }
}

/**
 * Seeds buyer A with an active subscription and switches the test session
 * to buyer B. Returns { subscriptionId, buyerA, buyerB, addressA, addressB, plan }
 * so each test can reason about the cross-actor pair cleanly.
 */
async function setupCrossBuyerScenario() {
  const { plan } = await createPlan()
  const { buyer: buyerA, address: addressA } = await createBuyerWithAddress('A')
  useTestSession(buildSession(buyerA.id, 'CUSTOMER'))
  const sub = await subscribeToPlan({ planId: plan.id, shippingAddressId: addressA.id })

  const { buyer: buyerB, address: addressB } = await createBuyerWithAddress('B')
  useTestSession(buildSession(buyerB.id, 'CUSTOMER'))

  return { subscriptionId: sub.id, buyerA, buyerB, addressA, addressB, plan }
}

// ── pauseSubscription ────────────────────────────────────────────────────

test('pauseSubscription: buyer B cannot pause buyer A subscription', async () => {
  const { subscriptionId } = await setupCrossBuyerScenario()
  await assert.rejects(() => pauseSubscription(subscriptionId), /no encontrada/i)
})

test('pauseSubscription: buyer A subscription row is unchanged after cross-buyer attempt', async () => {
  const { subscriptionId, buyerA } = await setupCrossBuyerScenario()

  const before = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: { status: true, pausedUntil: true, buyerId: true },
  })

  await pauseSubscription(subscriptionId).catch(() => {})

  const after = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: { status: true, pausedUntil: true, buyerId: true },
  })

  assert.equal(after?.status, before?.status)
  assert.equal(after?.pausedUntil, before?.pausedUntil)
  assert.equal(after?.buyerId, buyerA.id)
})

// ── resumeSubscription ───────────────────────────────────────────────────

test('resumeSubscription: buyer B cannot resume buyer A paused subscription', async () => {
  const { plan } = await createPlan()
  const { buyer: buyerA, address: addressA } = await createBuyerWithAddress('A')
  useTestSession(buildSession(buyerA.id, 'CUSTOMER'))
  const sub = await subscribeToPlan({ planId: plan.id, shippingAddressId: addressA.id })
  await pauseSubscription(sub.id)

  const buyerB = await createUser('CUSTOMER')
  useTestSession(buildSession(buyerB.id, 'CUSTOMER'))

  await assert.rejects(() => resumeSubscription(sub.id), /no encontrada/i)

  // Row must stay paused.
  const still = await db.subscription.findUnique({ where: { id: sub.id }, select: { status: true } })
  assert.equal(still?.status, 'PAUSED')
})

// ── skipNextDelivery ─────────────────────────────────────────────────────

test('skipNextDelivery: buyer B cannot skip buyer A delivery', async () => {
  const { subscriptionId } = await setupCrossBuyerScenario()
  await assert.rejects(() => skipNextDelivery(subscriptionId), /no encontrada/i)

  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: { skippedDeliveries: true },
  })
  // No skip date written.
  const skipped = Array.isArray(sub?.skippedDeliveries) ? sub!.skippedDeliveries : []
  assert.equal(skipped.length, 0)
})

// ── rescheduleNextDelivery ───────────────────────────────────────────────

test('rescheduleNextDelivery: buyer B cannot reschedule buyer A delivery', async () => {
  const { subscriptionId } = await setupCrossBuyerScenario()

  // Capture buyer A's pre-attempt delivery date so we can assert it
  // didn't change regardless of the default cadence seed.
  const before = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: { nextDeliveryAt: true },
  })

  // Pick a target that is NOT the current value and is within the
  // allowed [+2d, +60d] window. +14d avoids collision with the weekly
  // seed default.
  const target = new Date()
  target.setDate(target.getDate() + 14)

  await assert.rejects(
    () =>
      rescheduleNextDelivery({
        subscriptionId,
        nextDeliveryAt: target.toISOString().slice(0, 10),
      }),
    /no encontrada/i
  )

  const after = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: { nextDeliveryAt: true },
  })
  // nextDeliveryAt must be exactly what it was before the cross-buyer
  // attempt — the defense is that loadOwnedSubscription threw before any
  // db.subscription.update ran.
  assert.equal(
    after?.nextDeliveryAt.toISOString(),
    before?.nextDeliveryAt.toISOString()
  )
})

// ── startSubscriptionCheckout ────────────────────────────────────────────

test('startSubscriptionCheckout: buyer B cannot use buyer A shipping address', async () => {
  const { plan } = await createPlan()
  const { buyer: buyerA, address: addressA } = await createBuyerWithAddress('A')
  const buyerB = await createUser('CUSTOMER')
  void buyerA

  useTestSession(buildSession(buyerB.id, 'CUSTOMER'))

  await assert.rejects(
    () => startSubscriptionCheckout({ planId: plan.id, shippingAddressId: addressA.id }),
    /dirección/i
  )
})

// ── confirmMockSubscriptionCheckout ──────────────────────────────────────

test('confirmMockSubscriptionCheckout: buyer B cannot use buyer A shipping address', async () => {
  // Force mock mode so the action is reachable.
  const prevProvider = process.env.PAYMENT_PROVIDER
  process.env.PAYMENT_PROVIDER = 'mock'
  resetServerEnvCache()

  try {
    const { plan } = await createPlan()
    const { address: addressA } = await createBuyerWithAddress('A')
    const buyerB = await createUser('CUSTOMER')
    useTestSession(buildSession(buyerB.id, 'CUSTOMER'))

    // This action uses a soft-fail contract ({ok: false, reason}) instead
    // of throwing, to avoid 500'ing the mock-checkout confirmation page
    // on a stale URL. The security guarantee is the same: no subscription
    // row gets created for buyer B.
    const result = await confirmMockSubscriptionCheckout({
      sessionId: 'mock-sess-b',
      planId: plan.id,
      addressId: addressA.id,
    })
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'address-missing')
    assert.equal(result.subscriptionId, undefined)

    // No subscription row must have been created for buyer B.
    const count = await db.subscription.count({ where: { buyerId: buyerB.id } })
    assert.equal(count, 0)
  } finally {
    if (prevProvider) process.env.PAYMENT_PROVIDER = prevProvider
    else delete process.env.PAYMENT_PROVIDER
    resetServerEnvCache()
  }
})

// ── Defence-in-depth: loadOwnedSubscription throws, not returns null ─────

test('cross-buyer attempts surface as "no encontrada" errors, not silent success', async () => {
  // Pin the observable behaviour: every buyer action that scopes by
  // subscription id uses loadOwnedSubscription(), which throws
  // "Suscripción no encontrada" when the buyerId does not match. If a
  // future refactor changes this to `return null` instead, the callers
  // could easily forget to handle the null and accidentally perform
  // a privileged operation. This test fails loudly in that case.
  const { subscriptionId } = await setupCrossBuyerScenario()

  const failures: string[] = []
  for (const attempt of [
    () => pauseSubscription(subscriptionId),
    () => resumeSubscription(subscriptionId),
    () => skipNextDelivery(subscriptionId),
  ]) {
    try {
      await attempt()
      failures.push('did not throw')
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err))
    }
  }

  for (const msg of failures) {
    assert.match(msg, /no encontrada/i, `expected "no encontrada" error, got: ${msg}`)
  }
})
