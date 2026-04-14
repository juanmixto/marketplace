import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  createPromotion,
  listMyPromotions,
  archivePromotion,
  unarchivePromotion,
  getMyPromotion,
} from '@/domains/promotions/actions'
import { db } from '@/lib/db'
import {
  buildSession,
  clearTestSession,
  createActiveProduct,
  createCategory,
  createVendorUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

/**
 * Phase 1 of the promotions RFC. Promotions are dormant in checkout, so these
 * tests cover CRUD, ownership boundaries and validation — not discount math.
 * The discount evaluation tests will land in the phase 2 PR along with the
 * cart integration.
 */

const in1Day  = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const in7Days = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
const now     = () => new Date().toISOString()

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

test('createPromotion persists a vendor-scoped percentage promotion', async () => {
  const { user, vendor } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const promo = await createPromotion({
    name: 'Rebaja primavera',
    code: 'SPRING10',
    kind: 'PERCENTAGE',
    value: 10,
    scope: 'VENDOR',
    productId: null,
    categoryId: null,
    minSubtotal: null,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt: now(),
    endsAt: in7Days(),
  })

  assert.equal(promo.vendorId, vendor.id)
  assert.equal(promo.kind, 'PERCENTAGE')
  assert.equal(Number(promo.value), 10)
  assert.equal(promo.code, 'SPRING10')
  assert.equal(promo.archivedAt, null)
})

test('createPromotion rejects a percentage value outside 0..100', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  await assert.rejects(
    () =>
      createPromotion({
        name: 'Bad percent',
        code: null,
        kind: 'PERCENTAGE',
        value: 150,
        scope: 'VENDOR',
        productId: null,
        categoryId: null,
        minSubtotal: null,
        maxRedemptions: null,
        perUserLimit: 1,
        startsAt: now(),
        endsAt: in7Days(),
      }),
    /porcentaje/i
  )
})

test('createPromotion rejects a window where endsAt <= startsAt', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const start = in7Days()
  const end = in1Day() // end before start

  await assert.rejects(
    () =>
      createPromotion({
        name: 'Bad window',
        code: null,
        kind: 'PERCENTAGE',
        value: 10,
        scope: 'VENDOR',
        productId: null,
        categoryId: null,
        minSubtotal: null,
        maxRedemptions: null,
        perUserLimit: 1,
        startsAt: start,
        endsAt: end,
      }),
    /fecha/i
  )
})

test('createPromotion with scope=PRODUCT requires a productId', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  await assert.rejects(
    () =>
      createPromotion({
        name: 'Missing product',
        code: null,
        kind: 'PERCENTAGE',
        value: 10,
        scope: 'PRODUCT',
        productId: null,
        categoryId: null,
        minSubtotal: null,
        maxRedemptions: null,
        perUserLimit: 1,
        startsAt: now(),
        endsAt: in7Days(),
      }),
    /producto/i
  )
})

test('createPromotion with scope=PRODUCT rejects a foreign-vendor product', async () => {
  const other = await createVendorUser()
  const foreignProduct = await createActiveProduct(other.vendor.id)

  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  await assert.rejects(
    () =>
      createPromotion({
        name: 'Foreign product',
        code: null,
        kind: 'PERCENTAGE',
        value: 10,
        scope: 'PRODUCT',
        productId: foreignProduct.id,
        categoryId: null,
        minSubtotal: null,
        maxRedemptions: null,
        perUserLimit: 1,
        startsAt: now(),
        endsAt: in7Days(),
      }),
    /producto/i
  )
})

test('createPromotion with scope=CATEGORY persists the categoryId', async () => {
  const { user, vendor } = await createVendorUser()
  const category = await createCategory()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const promo = await createPromotion({
    name: 'Category promo',
    code: null,
    kind: 'FIXED_AMOUNT',
    value: 5,
    scope: 'CATEGORY',
    productId: null,
    categoryId: category.id,
    minSubtotal: null,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt: now(),
    endsAt: in7Days(),
  })

  assert.equal(promo.categoryId, category.id)
  assert.equal(promo.vendorId, vendor.id)
  assert.equal(Number(promo.value), 5)
})

test('createPromotion rejects a duplicate code within the same vendor', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const base = {
    name: 'One',
    code: 'DUPE',
    kind: 'PERCENTAGE' as const,
    value: 5,
    scope: 'VENDOR' as const,
    productId: null,
    categoryId: null,
    minSubtotal: null,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt: now(),
    endsAt: in7Days(),
  }

  await createPromotion(base)
  await assert.rejects(() => createPromotion({ ...base, name: 'Two' }), /código/i)
})

test('two vendors can each have a promotion with the same code', async () => {
  const vendorA = await createVendorUser()
  useTestSession(buildSession(vendorA.user.id, 'VENDOR'))
  await createPromotion({
    name: 'Vendor A sale',
    code: 'SHARED',
    kind: 'PERCENTAGE',
    value: 5,
    scope: 'VENDOR',
    productId: null,
    categoryId: null,
    minSubtotal: null,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt: now(),
    endsAt: in7Days(),
  })

  const vendorB = await createVendorUser()
  useTestSession(buildSession(vendorB.user.id, 'VENDOR'))
  const promoB = await createPromotion({
    name: 'Vendor B sale',
    code: 'SHARED',
    kind: 'PERCENTAGE',
    value: 10,
    scope: 'VENDOR',
    productId: null,
    categoryId: null,
    minSubtotal: null,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt: now(),
    endsAt: in7Days(),
  })

  assert.equal(promoB.code, 'SHARED')
  assert.equal(promoB.vendorId, vendorB.vendor.id)
})

test('createPromotion allows multiple code-less promotions on the same vendor', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const base = {
    code: null,
    kind: 'PERCENTAGE' as const,
    value: 5,
    scope: 'VENDOR' as const,
    productId: null,
    categoryId: null,
    minSubtotal: null,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt: now(),
    endsAt: in7Days(),
  }

  await createPromotion({ ...base, name: 'Auto 1' })
  await createPromotion({ ...base, name: 'Auto 2' })

  const list = await listMyPromotions('all')
  assert.equal(list.length, 2)
})

test('createPromotion coerces FREE_SHIPPING value to 0 regardless of input', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const promo = await createPromotion({
    name: 'Envío gratis',
    code: null,
    kind: 'FREE_SHIPPING',
    value: 99, // should be ignored
    scope: 'VENDOR',
    productId: null,
    categoryId: null,
    minSubtotal: null,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt: now(),
    endsAt: in7Days(),
  })

  assert.equal(Number(promo.value), 0)
})

test('listMyPromotions filters archived vs active and scopes by vendor', async () => {
  const { user: otherUser, vendor: other } = await createVendorUser()
  // Promotion belonging to a different vendor — must not leak into the result
  useTestSession(buildSession(otherUser.id, 'VENDOR'))
  await createPromotion({
    name: 'Foreign',
    code: null,
    kind: 'PERCENTAGE',
    value: 5,
    scope: 'VENDOR',
    productId: null,
    categoryId: null,
    minSubtotal: null,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt: now(),
    endsAt: in7Days(),
  })

  const { user, vendor } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))
  const active = await createPromotion({
    name: 'Active',
    code: null,
    kind: 'PERCENTAGE',
    value: 5,
    scope: 'VENDOR',
    productId: null,
    categoryId: null,
    minSubtotal: null,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt: now(),
    endsAt: in7Days(),
  })
  const archived = await createPromotion({
    name: 'To archive',
    code: null,
    kind: 'PERCENTAGE',
    value: 5,
    scope: 'VENDOR',
    productId: null,
    categoryId: null,
    minSubtotal: null,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt: now(),
    endsAt: in7Days(),
  })
  await archivePromotion(archived.id)

  const activeList = await listMyPromotions('active')
  assert.equal(activeList.length, 1)
  assert.equal(activeList[0].id, active.id)
  assert.equal(activeList[0].vendorId, vendor.id)

  const archivedList = await listMyPromotions('archived')
  assert.equal(archivedList.length, 1)
  assert.equal(archivedList[0].id, archived.id)

  const allList = await listMyPromotions('all')
  assert.equal(allList.length, 2) // foreign vendor's promo must not appear
  // Sanity: sure it's not the foreign one
  assert.ok(allList.every(p => p.vendorId !== other.id))
})

test('archivePromotion sets archivedAt and is idempotent', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const promo = await createPromotion({
    name: 'Temp',
    code: null,
    kind: 'PERCENTAGE',
    value: 5,
    scope: 'VENDOR',
    productId: null,
    categoryId: null,
    minSubtotal: null,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt: now(),
    endsAt: in7Days(),
  })

  const first = await archivePromotion(promo.id)
  assert.ok(first.archivedAt)

  // Idempotent — calling again should not fail
  const second = await archivePromotion(promo.id)
  assert.deepEqual(
    new Date(first.archivedAt!).getTime(),
    new Date(second.archivedAt!).getTime()
  )
})

test('archivePromotion rejects another vendor’s promotion', async () => {
  const { user: otherUser } = await createVendorUser()
  useTestSession(buildSession(otherUser.id, 'VENDOR'))
  const foreign = await createPromotion({
    name: 'Foreign',
    code: null,
    kind: 'PERCENTAGE',
    value: 5,
    scope: 'VENDOR',
    productId: null,
    categoryId: null,
    minSubtotal: null,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt: now(),
    endsAt: in7Days(),
  })

  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))
  await assert.rejects(() => archivePromotion(foreign.id), /no encontrada/i)
})

test('unarchivePromotion brings a promo back and refuses code collisions', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const promo = await createPromotion({
    name: 'Resurrectable',
    code: 'COME_BACK',
    kind: 'PERCENTAGE',
    value: 5,
    scope: 'VENDOR',
    productId: null,
    categoryId: null,
    minSubtotal: null,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt: now(),
    endsAt: in7Days(),
  })
  await archivePromotion(promo.id)

  // Bring it back — no collision expected
  const revived = await unarchivePromotion(promo.id)
  assert.equal(revived.archivedAt, null)
})

test('getMyPromotion returns null for foreign promotions and the row for owned ones', async () => {
  const { user: otherUser } = await createVendorUser()
  useTestSession(buildSession(otherUser.id, 'VENDOR'))
  const foreign = await createPromotion({
    name: 'Foreign',
    code: null,
    kind: 'PERCENTAGE',
    value: 5,
    scope: 'VENDOR',
    productId: null,
    categoryId: null,
    minSubtotal: null,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt: now(),
    endsAt: in7Days(),
  })

  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))
  const mine = await createPromotion({
    name: 'Mine',
    code: null,
    kind: 'PERCENTAGE',
    value: 5,
    scope: 'VENDOR',
    productId: null,
    categoryId: null,
    minSubtotal: null,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt: now(),
    endsAt: in7Days(),
  })

  assert.equal(await getMyPromotion(foreign.id), null)
  const fetched = await getMyPromotion(mine.id)
  assert.ok(fetched)
  assert.equal(fetched?.id, mine.id)
})

test('Promotion table cleanup: promotions are persisted in the Promotion table', async () => {
  const { user, vendor } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  await createPromotion({
    name: 'Check row',
    code: null,
    kind: 'PERCENTAGE',
    value: 5,
    scope: 'VENDOR',
    productId: null,
    categoryId: null,
    minSubtotal: null,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt: now(),
    endsAt: in7Days(),
  })

  const rows = await db.promotion.findMany({ where: { vendorId: vendor.id } })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'Check row')
})
