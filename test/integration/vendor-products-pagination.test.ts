import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import {
  buildSession,
  createVendorUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'
import { getMyProductsPaginated, getMyProductAlerts } from '@/domains/vendors/actions'
import { VENDOR_PRODUCT_PAGE_SIZE } from '@/domains/vendors/types'

/**
 * DB audit P1.2-C (#963). The vendor catalog dashboard now paginates
 * the product list and pulls alerts (low stock, out of stock, expired)
 * via separate aggregate queries that always reflect the full vendor
 * catalog, not just the visible page.
 */

async function seedProducts(
  vendorId: string,
  n: number,
  overrides: Partial<{ status: string; stock: number; trackStock: boolean; archived: boolean }> = {},
) {
  const out = []
  for (let i = 0; i < n; i++) {
    const category = await db.category.create({
      data: { name: `cat-${i}-${Date.now()}`, slug: `cat-${i}-${Date.now()}` },
    })
    const p = await db.product.create({
      data: {
        vendorId,
        categoryId: category.id,
        name: `Producto ${i}`,
        slug: `producto-${i}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        basePrice: 12,
        taxRate: 0.1,
        unit: 'ud',
        stock: overrides.stock ?? 10,
        trackStock: overrides.trackStock ?? true,
        images: [],
        certifications: [],
        tags: [],
        status: (overrides.status as 'ACTIVE' | 'DRAFT') ?? 'ACTIVE',
        ...(overrides.archived ? { archivedAt: new Date() } : {}),
        createdAt: new Date(Date.now() + i * 1_000),
      },
    })
    out.push(p)
  }
  return out
}

beforeEach(async () => {
  await resetIntegrationDatabase()
})

test('getMyProductsPaginated returns at most pageSize and signals next', async () => {
  const { user, vendor } = await createVendorUser()
  await seedProducts(vendor.id, VENDOR_PRODUCT_PAGE_SIZE + 4)

  useTestSession(buildSession(user.id, 'VENDOR'))
  const page1 = await getMyProductsPaginated({})
  assert.equal(page1.items.length, VENDOR_PRODUCT_PAGE_SIZE)
  assert.equal(page1.hasNextPage, true)
  assert.ok(page1.nextCursor)

  const page2 = await getMyProductsPaginated({ cursor: page1.nextCursor! })
  assert.equal(page2.items.length, 4)
  assert.equal(page2.hasNextPage, false)
})

test('getMyProductsPaginated honours filter=outOfStock + cross-vendor scoping', async () => {
  const { user: userA, vendor: vendorA } = await createVendorUser()
  const { vendor: vendorB } = await createVendorUser()

  await seedProducts(vendorA.id, 2, { stock: 0, trackStock: true })
  await seedProducts(vendorA.id, 3, { stock: 5, trackStock: true })
  await seedProducts(vendorB.id, 4, { stock: 0, trackStock: true })

  useTestSession(buildSession(userA.id, 'VENDOR'))
  const page = await getMyProductsPaginated({ filter: 'outOfStock' })

  assert.equal(page.items.length, 2)
  for (const p of page.items) {
    assert.equal(p.vendorId, vendorA.id)
    assert.equal(p.stock, 0)
  }
})

test('getMyProductAlerts aggregates over the full catalog', async () => {
  const { user, vendor } = await createVendorUser()
  await seedProducts(vendor.id, 3, { stock: 2 }) // low stock
  await seedProducts(vendor.id, 1, { stock: 0, status: 'ACTIVE' }) // out of stock
  await seedProducts(vendor.id, 2, { stock: 10 }) // healthy
  await seedProducts(vendor.id, 1, { stock: 10, archived: true }) // archived (excluded)

  useTestSession(buildSession(user.id, 'VENDOR'))
  const alerts = await getMyProductAlerts()

  assert.equal(alerts.lowStockCount, 3)
  assert.equal(alerts.outOfStockCount, 1)
  // totalActiveCatalog excludes archived rows; 3 + 1 + 2 = 6.
  assert.equal(alerts.totalActiveCatalog, 6)
})
