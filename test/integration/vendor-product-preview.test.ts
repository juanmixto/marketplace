import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { getMyProduct } from '@/domains/vendors/actions'
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
 * Vendor product preview feeds on getMyProduct — it must return the owning
 * vendor's products regardless of status (DRAFT, PENDING_REVIEW, REJECTED,
 * SUSPENDED) so the vendor can inspect how any of them would render. This
 * test locks that behaviour and the ownership guard that keeps a vendor from
 * peeking at another vendor's drafts via a hand-crafted URL.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

test('getMyProduct returns the owning vendor products in every status', async () => {
  const { user, vendor } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const statuses = ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'SUSPENDED'] as const

  for (const status of statuses) {
    const created = await createActiveProduct(vendor.id, { status })
    const fetched = await getMyProduct(created.id)
    assert.ok(fetched, `getMyProduct should return a product with status ${status}`)
    assert.equal(fetched?.id, created.id)
    assert.equal(fetched?.status, status)
  }
})

test('getMyProduct returns null when another vendor owns the product', async () => {
  const other = await createVendorUser()
  const foreignProduct = await createActiveProduct(other.vendor.id, { status: 'DRAFT' })

  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const fetched = await getMyProduct(foreignProduct.id)
  assert.equal(fetched, null)
})

test('a soft-deleted product is not retrievable via getMyProduct', async () => {
  const { user, vendor } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const product = await createActiveProduct(vendor.id, { status: 'DRAFT' })
  await db.product.update({
    where: { id: product.id },
    data: { deletedAt: new Date() },
  })

  const fetched = await getMyProduct(product.id)
  assert.equal(fetched, null)
})
