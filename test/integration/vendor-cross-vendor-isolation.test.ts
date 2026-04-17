import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  updateProduct,
  deleteProduct,
  advanceFulfillment,
  setProductStock,
} from '@/domains/vendors/actions'
import {
  updatePromotion,
  archivePromotion,
  unarchivePromotion,
} from '@/domains/promotions/actions'
import { upsertDefaultVendorAddress } from '@/domains/shipping/vendor-address-actions'
import { getPendingSettlements } from '@/domains/settlements/approve'
import { db } from '@/lib/db'
import {
  buildSession,
  clearTestSession,
  createActiveProduct,
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

async function createPromotionFor(vendorId: string) {
  return db.promotion.create({
    data: {
      vendorId,
      name: 'Promo test',
      kind: 'PERCENTAGE',
      scope: 'VENDOR',
      value: 10,
      perUserLimit: 1,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })
}

test('vendor B cannot updateProduct of vendor A', async () => {
  const { user: userA, vendor: vendorA } = await createVendorUser()
  const { user: userB } = await createVendorUser()
  const productA = await createActiveProduct(vendorA.id, { name: 'Vino A' })

  useTestSession(buildSession(userB.id, 'VENDOR'))
  await assert.rejects(
    () => updateProduct(productA.id, { name: 'Hijack' }),
    /Producto no encontrado|no encontrado/i
  )

  const stored = await db.product.findUnique({ where: { id: productA.id } })
  assert.equal(stored?.name, 'Vino A')
  // Silence unused var warning — we still use it to anchor the test setup.
  void userA
})

test('vendor B cannot deleteProduct of vendor A', async () => {
  const { vendor: vendorA } = await createVendorUser()
  const { user: userB } = await createVendorUser()
  const productA = await createActiveProduct(vendorA.id)

  useTestSession(buildSession(userB.id, 'VENDOR'))
  await assert.rejects(() => deleteProduct(productA.id), /no encontrado/i)

  const stored = await db.product.findUnique({ where: { id: productA.id } })
  assert.ok(stored, 'product must still exist after rejected cross-vendor delete')
})

test('vendor B cannot setProductStock of vendor A', async () => {
  const { vendor: vendorA } = await createVendorUser()
  const { user: userB } = await createVendorUser()
  const productA = await createActiveProduct(vendorA.id, { stock: 5 })

  useTestSession(buildSession(userB.id, 'VENDOR'))
  await assert.rejects(
    () => setProductStock({ productId: productA.id, stock: 99 }),
    /no encontrado/i
  )

  const stored = await db.product.findUnique({ where: { id: productA.id } })
  assert.equal(stored?.stock, 5)
})

test('vendor B cannot updatePromotion of vendor A', async () => {
  const { vendor: vendorA } = await createVendorUser()
  const { user: userB } = await createVendorUser()
  const promo = await createPromotionFor(vendorA.id)

  useTestSession(buildSession(userB.id, 'VENDOR'))
  await assert.rejects(
    () =>
      updatePromotion(promo.id, {
        name: 'Hijacked',
        kind: 'PERCENTAGE',
        scope: 'VENDOR',
        value: 99,
        perUserLimit: 1,
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
      }),
    /Promoci[óo]n no encontrada/i
  )

  const stored = await db.promotion.findUnique({ where: { id: promo.id } })
  assert.equal(stored?.name, 'Promo test')
})

test('vendor B cannot archivePromotion or unarchivePromotion of vendor A', async () => {
  const { vendor: vendorA } = await createVendorUser()
  const { user: userB } = await createVendorUser()
  const promo = await createPromotionFor(vendorA.id)

  useTestSession(buildSession(userB.id, 'VENDOR'))
  await assert.rejects(() => archivePromotion(promo.id), /no encontrada/i)
  await assert.rejects(() => unarchivePromotion(promo.id), /no encontrada/i)

  const stored = await db.promotion.findUnique({ where: { id: promo.id } })
  assert.equal(stored?.archivedAt, null)
})

test('vendor B cannot advanceFulfillment of vendor A', async () => {
  const { user: userA, vendor: vendorA } = await createVendorUser()
  const { user: userB } = await createVendorUser()

  // Build a minimal order with a fulfillment owned by vendor A.
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-${Date.now()}`,
      customerId: userA.id,
      status: 'PLACED',
      paymentStatus: 'SUCCEEDED',
      subtotal: 10,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 10,
      fulfillments: {
        create: { vendorId: vendorA.id, status: 'CONFIRMED' },
      },
    },
    include: { fulfillments: true },
  })
  const fulfillmentA = order.fulfillments[0]!

  useTestSession(buildSession(userB.id, 'VENDOR'))
  await assert.rejects(
    () => advanceFulfillment(fulfillmentA.id, 'READY'),
    /no encontrad|not found|denegad/i
  )

  const stored = await db.vendorFulfillment.findUnique({
    where: { id: fulfillmentA.id },
  })
  assert.equal(stored?.status, 'CONFIRMED')
})

test('upsertDefaultVendorAddress always assigns vendorId from the session', async () => {
  const { user: userA, vendor: vendorA } = await createVendorUser()
  const { user: userB, vendor: vendorB } = await createVendorUser()

  useTestSession(buildSession(userA.id, 'VENDOR'))
  const result = await upsertDefaultVendorAddress({
    label: 'Almacén',
    contactName: 'Vendor A',
    phone: '600600600',
    line1: 'Calle Productor 1',
    line2: '',
    city: 'Madrid',
    province: 'Madrid',
    postalCode: '28001',
    countryCode: 'ES',
  })
  assert.equal(result.ok, true)

  const addresses = await db.vendorAddress.findMany()
  assert.equal(addresses.length, 1)
  assert.equal(addresses[0].vendorId, vendorA.id)

  // Vendor B never appears as the owner just because their id is in scope.
  void userB
  void vendorB
})

test('getPendingSettlements rejects callers without SUPERADMIN role', async () => {
  const { user: vendorUser } = await createVendorUser()

  useTestSession(buildSession(vendorUser.id, 'VENDOR'))
  await assert.rejects(() => getPendingSettlements(), /No autorizado/i)

  useTestSession(buildSession(vendorUser.id, 'CUSTOMER'))
  await assert.rejects(() => getPendingSettlements(), /No autorizado/i)
})

test('getPendingSettlements allows SUPERADMIN', async () => {
  const adminUser = await db.user.create({
    data: {
      email: `admin-${Date.now()}@example.com`,
      firstName: 'Admin',
      lastName: 'Tester',
      role: 'SUPERADMIN',
      isActive: true,
    },
  })
  useTestSession(buildSession(adminUser.id, 'SUPERADMIN'))
  const rows = await getPendingSettlements()
  assert.ok(Array.isArray(rows))
})
