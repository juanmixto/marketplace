import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  createSubscriptionPlan,
  listMySubscriptionPlans,
  archiveSubscriptionPlan,
  unarchiveSubscriptionPlan,
  getMySubscriptionPlan,
} from '@/domains/subscriptions/actions'
import { db } from '@/lib/db'
import {
  buildSession,
  clearTestSession,
  createActiveProduct,
  createVendorUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

/**
 * Phase 3 of the promotions & subscriptions RFC. Vendor-side CRUD for
 * subscription plans. No buyer flow, no Stripe Subscriptions yet — so the
 * tests cover CRUD, ownership boundaries, product eligibility, the unique
 * product-to-plan relation, and the archive / reactivate lifecycle.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

test('createSubscriptionPlan persists a weekly plan for an active product and snapshots the price', async () => {
  const { user, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { basePrice: 27.5, taxRate: 0.1 })
  useTestSession(buildSession(user.id, 'VENDOR'))

  const plan = await createSubscriptionPlan({
    productId: product.id,
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 5,
  })

  assert.equal(plan.vendorId, vendor.id)
  assert.equal(plan.productId, product.id)
  assert.equal(plan.cadence, 'WEEKLY')
  assert.equal(plan.cutoffDayOfWeek, 5)
  assert.equal(Number(plan.priceSnapshot), 27.5)
  assert.equal(Number(plan.taxRateSnapshot), 0.1)
  assert.equal(plan.archivedAt, null)
})

test('createSubscriptionPlan rejects a product that belongs to another vendor', async () => {
  const other = await createVendorUser()
  const foreignProduct = await createActiveProduct(other.vendor.id)

  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  await assert.rejects(
    () =>
      createSubscriptionPlan({
        productId: foreignProduct.id,
        cadence: 'WEEKLY',
        cutoffDayOfWeek: 5,
      }),
    /producto activo/i
  )
})

test('createSubscriptionPlan rejects a DRAFT product', async () => {
  const { user, vendor } = await createVendorUser()
  const draft = await createActiveProduct(vendor.id, { status: 'DRAFT' })
  useTestSession(buildSession(user.id, 'VENDOR'))

  await assert.rejects(
    () =>
      createSubscriptionPlan({
        productId: draft.id,
        cadence: 'WEEKLY',
        cutoffDayOfWeek: 5,
      }),
    /producto activo/i
  )
})

test('createSubscriptionPlan refuses a second active plan for the same product', async () => {
  const { user, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id)
  useTestSession(buildSession(user.id, 'VENDOR'))

  await createSubscriptionPlan({
    productId: product.id,
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 5,
  })

  await assert.rejects(
    () =>
      createSubscriptionPlan({
        productId: product.id,
        cadence: 'MONTHLY',
        cutoffDayOfWeek: 0,
      }),
    /plan de suscripción activo/i
  )
})

test('createSubscriptionPlan refuses a new plan for a product with an ARCHIVED plan — unarchive instead', async () => {
  const { user, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id)
  useTestSession(buildSession(user.id, 'VENDOR'))

  const plan = await createSubscriptionPlan({
    productId: product.id,
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 5,
  })
  await archiveSubscriptionPlan(plan.id)

  await assert.rejects(
    () =>
      createSubscriptionPlan({
        productId: product.id,
        cadence: 'MONTHLY',
        cutoffDayOfWeek: 0,
      }),
    /archivado/i
  )
})

test('createSubscriptionPlan rejects an invalid cutoffDayOfWeek', async () => {
  const { user, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id)
  useTestSession(buildSession(user.id, 'VENDOR'))

  await assert.rejects(
    () =>
      createSubscriptionPlan({
        productId: product.id,
        cadence: 'WEEKLY',
        cutoffDayOfWeek: 9 as unknown as number,
      })
  )
})

test('listMySubscriptionPlans filters archived vs active and scopes by vendor', async () => {
  // Foreign vendor — must never leak into the current vendor's list
  const { user: otherUser, vendor: otherVendor } = await createVendorUser()
  const otherProduct = await createActiveProduct(otherVendor.id)
  useTestSession(buildSession(otherUser.id, 'VENDOR'))
  await createSubscriptionPlan({
    productId: otherProduct.id,
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 5,
  })

  const { user, vendor } = await createVendorUser()
  const productA = await createActiveProduct(vendor.id)
  const productB = await createActiveProduct(vendor.id)
  useTestSession(buildSession(user.id, 'VENDOR'))

  const active = await createSubscriptionPlan({
    productId: productA.id,
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 5,
  })
  const toArchive = await createSubscriptionPlan({
    productId: productB.id,
    cadence: 'MONTHLY',
    cutoffDayOfWeek: 0,
  })
  await archiveSubscriptionPlan(toArchive.id)

  const activeList = await listMySubscriptionPlans('active')
  assert.equal(activeList.length, 1)
  assert.equal(activeList[0].id, active.id)

  const archivedList = await listMySubscriptionPlans('archived')
  assert.equal(archivedList.length, 1)
  assert.equal(archivedList[0].id, toArchive.id)

  const allList = await listMySubscriptionPlans('all')
  assert.equal(allList.length, 2) // foreign vendor's plan must not appear
  assert.ok(allList.every(p => p.vendorId === vendor.id))
})

test('archiveSubscriptionPlan is idempotent and rejects another vendor’s plan', async () => {
  const { user, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id)
  useTestSession(buildSession(user.id, 'VENDOR'))

  const plan = await createSubscriptionPlan({
    productId: product.id,
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 5,
  })
  const first = await archiveSubscriptionPlan(plan.id)
  assert.ok(first.archivedAt)

  const second = await archiveSubscriptionPlan(plan.id)
  assert.deepEqual(
    new Date(first.archivedAt!).getTime(),
    new Date(second.archivedAt!).getTime()
  )

  // Foreign archive attempt
  const { user: otherUser } = await createVendorUser()
  useTestSession(buildSession(otherUser.id, 'VENDOR'))
  await assert.rejects(() => archiveSubscriptionPlan(plan.id), /no encontrado/i)
})

test('unarchiveSubscriptionPlan refuses when the product is no longer active', async () => {
  const { user, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id)
  useTestSession(buildSession(user.id, 'VENDOR'))

  const plan = await createSubscriptionPlan({
    productId: product.id,
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 5,
  })
  await archiveSubscriptionPlan(plan.id)

  // Simulate the vendor soft-deleting the product after archiving the plan.
  await db.product.update({
    where: { id: product.id },
    data: { deletedAt: new Date(), status: 'SUSPENDED' },
  })

  await assert.rejects(() => unarchiveSubscriptionPlan(plan.id), /no está activo/i)
})

test('unarchiveSubscriptionPlan brings an archived plan back when the product is still active', async () => {
  const { user, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id)
  useTestSession(buildSession(user.id, 'VENDOR'))

  const plan = await createSubscriptionPlan({
    productId: product.id,
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 5,
  })
  await archiveSubscriptionPlan(plan.id)
  const revived = await unarchiveSubscriptionPlan(plan.id)
  assert.equal(revived.archivedAt, null)
})

test('getMySubscriptionPlan returns null for a foreign plan and the row for an owned one', async () => {
  const { user: otherUser, vendor: otherVendor } = await createVendorUser()
  const otherProduct = await createActiveProduct(otherVendor.id)
  useTestSession(buildSession(otherUser.id, 'VENDOR'))
  const foreign = await createSubscriptionPlan({
    productId: otherProduct.id,
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 5,
  })

  const { user, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id)
  useTestSession(buildSession(user.id, 'VENDOR'))
  const mine = await createSubscriptionPlan({
    productId: product.id,
    cadence: 'MONTHLY',
    cutoffDayOfWeek: 3,
  })

  assert.equal(await getMySubscriptionPlan(foreign.id), null)
  const fetched = await getMySubscriptionPlan(mine.id)
  assert.ok(fetched)
  assert.equal(fetched?.id, mine.id)
})

test('price snapshot is frozen at creation — later product price changes do not affect the plan', async () => {
  const { user, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { basePrice: 20 })
  useTestSession(buildSession(user.id, 'VENDOR'))

  const plan = await createSubscriptionPlan({
    productId: product.id,
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 5,
  })
  assert.equal(Number(plan.priceSnapshot), 20)

  // Vendor raises the catalog price.
  await db.product.update({
    where: { id: product.id },
    data: { basePrice: 30 },
  })

  const stored = await db.subscriptionPlan.findUnique({ where: { id: plan.id } })
  assert.equal(Number(stored?.priceSnapshot), 20)
})
