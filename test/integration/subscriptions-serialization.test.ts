import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  listMySubscriptionPlans,
  createSubscriptionPlan,
} from '@/domains/subscriptions/actions'
import {
  listMySubscriptions,
} from '@/domains/subscriptions/buyer-actions'
import {
  listMyPromotions,
  createPromotion,
} from '@/domains/promotions/actions'
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
 * Regression coverage for Next 16's strict server→client serializer.
 * Any field that leaves the vendor / buyer list actions and ends up in
 * a client component MUST be a plain-JS value — Prisma's Decimal, Buffer,
 * and custom class instances crash the React RSC boundary with
 * "Only plain objects can be passed to Client Components from Server
 * Components".
 *
 * The existing phase-1 / phase-3 / phase-4a tests only exercise the
 * action return value inside Node (no boundary crossing), so they miss
 * this class of bug. These assertions explicitly check for the
 * constructor name Prisma attaches to Decimal values so a future
 * refactor that forgets to serialize a new field fails CI loudly.
 */

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

function assertPlainValue(value: unknown, field: string) {
  if (value === null || value === undefined) return
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return
  if (value instanceof Date) return
  if (Array.isArray(value)) return
  if (typeof value === 'object') {
    const ctor = (value as object).constructor?.name
    if (ctor === 'Decimal' || ctor === 'BigNumber' || ctor === 'Prisma.Decimal') {
      throw new Error(`${field} is a Decimal instance; it must be converted to number before crossing the RSC boundary`)
    }
  }
}

test('listMyPromotions returns plain-JS rows — no Decimal instances in value / minSubtotal', async () => {
  const { user, vendor } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  await createPromotion({
    name: 'Auto 10%',
    code: null,
    kind: 'PERCENTAGE',
    value: 10,
    scope: 'VENDOR',
    productId: null,
    categoryId: null,
    minSubtotal: 20,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  })

  const rows = await listMyPromotions('all')
  assert.equal(rows.length, 1)
  const row = rows[0]
  assert.equal(typeof row.value, 'number')
  assert.equal(row.value, 10)
  assert.equal(typeof row.minSubtotal, 'number')
  assert.equal(row.minSubtotal, 20)
  assertPlainValue(row.value, 'value')
  assertPlainValue(row.minSubtotal, 'minSubtotal')

  // Safety net: sibling fields must also serialize cleanly.
  assert.equal(row.vendorId, vendor.id)
  assert.ok(row.startsAt instanceof Date)
  assert.ok(row.endsAt instanceof Date)
})

test('listMySubscriptionPlans returns plain-JS priceSnapshot / taxRateSnapshot', async () => {
  const { user, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { basePrice: 24.5, taxRate: 0.1 })
  useTestSession(buildSession(user.id, 'VENDOR'))

  await createSubscriptionPlan({
    productId: product.id,
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 5,
  })

  const rows = await listMySubscriptionPlans('all')
  assert.equal(rows.length, 1)
  const row = rows[0]
  assert.equal(typeof row.priceSnapshot, 'number')
  assert.equal(row.priceSnapshot, 24.5)
  assert.equal(typeof row.taxRateSnapshot, 'number')
  assertPlainValue(row.priceSnapshot, 'priceSnapshot')
  assertPlainValue(row.taxRateSnapshot, 'taxRateSnapshot')
  assert.ok(row.product)
  assert.equal(row.product.name, product.name)
})

test('listMySubscriptions returns plain-JS plan.priceSnapshot + shippingAddress', async () => {
  const { user: vendorUser, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { basePrice: 30 })
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
  await db.subscription.create({
    data: {
      buyerId: buyer.id,
      planId: plan.id,
      shippingAddressId: address.id,
      status: 'ACTIVE',
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      nextDeliveryAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const rows = await listMySubscriptions('all')
  assert.equal(rows.length, 1)
  const row = rows[0]
  assert.equal(typeof row.plan.priceSnapshot, 'number')
  assert.equal(row.plan.priceSnapshot, 30)
  assert.equal(typeof row.plan.taxRateSnapshot, 'number')
  assertPlainValue(row.plan.priceSnapshot, 'plan.priceSnapshot')
  assertPlainValue(row.plan.taxRateSnapshot, 'plan.taxRateSnapshot')
  assert.equal(row.shippingAddress.postalCode, '28001')
})
