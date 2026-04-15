import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createPromotion } from '@/domains/promotions/actions'
import { getActivePromotionsForProduct } from '@/domains/promotions/public'
import { getProductBySlug } from '@/domains/catalog/queries'
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
 * Ticket #374 — end-to-end pin: a 20% product-scoped promotion must be
 * reflected by the public catalog reader at every lifecycle step
 * (baseline → active → expired).
 *
 * Shape note (discovered while writing this test):
 *   - `getProductBySlug` returns the bare `basePrice` only. It does NOT
 *     compute an effective price net of promotions. The public reader
 *     for promotions is `getActivePromotionsForProduct`, which the
 *     product-detail page calls separately (see
 *     `src/app/(public)/productos/[slug]/page.tsx`).
 *   - Therefore "the public catalog price reflects the current state"
 *     is verified by (a) asserting the `basePrice` stays 10.00 and
 *     (b) asserting the active-promotions array contains/omits the
 *     20% promo at the right step. A 20% computation on top of the
 *     returned promotion value seals the boundary.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

test('vendor 20% promotion lifecycle is reflected by the public catalog reader', async () => {
  // ── 1. Fixtures ────────────────────────────────────────────────────────────
  const { user, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { basePrice: 10 })

  // Helper: read the product + its active promotions through the same
  // paths the public product-detail page uses.
  async function readPublic() {
    const detail = await getProductBySlug(product.slug)
    assert.ok(detail, 'product must be visible to the public reader')
    const promos = await getActivePromotionsForProduct({
      productId: detail.id,
      vendorId: detail.vendorId,
      categoryId: detail.categoryId,
    })
    return { detail, promos }
  }

  // Helper: compute the effective unit price given a basePrice and the
  // promotions array the public reader surfaced. Kept local to the test
  // so we don't fabricate a shared pricing helper that doesn't exist.
  function effectivePrice(basePrice: number, promos: Array<{ kind: string; value: number }>) {
    const pct = promos.find(p => p.kind === 'PERCENTAGE')
    if (pct) return +(basePrice * (1 - pct.value / 100)).toFixed(2)
    return basePrice
  }

  // ── 2. Baseline: no promotion, effective price == basePrice == 10.00 ───────
  {
    const { detail, promos } = await readPublic()
    assert.equal(Number(detail.basePrice), 10)
    assert.deepEqual(promos, [], 'no promotions should be active at baseline')
    assert.equal(effectivePrice(Number(detail.basePrice), promos), 10)
  }

  // ── 3. Create the 20% PRODUCT-scoped promotion as the vendor ───────────────
  useTestSession(buildSession(user.id, 'VENDOR'))

  const startsAt = new Date(Date.now() - 1_000).toISOString() // avoid clock skew
  const endsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // +1h

  const created = await createPromotion({
    name: '20% off test product',
    code: null,
    kind: 'PERCENTAGE',
    value: 20,
    scope: 'PRODUCT',
    productId: product.id,
    categoryId: null,
    minSubtotal: null,
    maxRedemptions: null,
    perUserLimit: 1,
    startsAt,
    endsAt,
  })

  assert.equal(created.vendorId, vendor.id)
  assert.equal(created.kind, 'PERCENTAGE')
  assert.equal(Number(created.value), 20)
  assert.equal(created.productId, product.id)
  assert.equal(created.archivedAt, null)

  // Sanity: the row really is in the DB and in-window.
  const row = await db.promotion.findUnique({ where: { id: created.id } })
  assert.ok(row)
  assert.ok(row.startsAt.getTime() <= Date.now())
  assert.ok(row.endsAt.getTime() > Date.now())
  assert.equal(row.archivedAt, null)

  // ── 4. Active: the public reader should surface the promo, 8.00 effective ─
  {
    const { detail, promos } = await readPublic()
    assert.equal(Number(detail.basePrice), 10, 'basePrice must not mutate')
    assert.equal(promos.length, 1, 'exactly one promotion should be active')
    assert.equal(promos[0].id, created.id)
    assert.equal(promos[0].kind, 'PERCENTAGE')
    assert.equal(promos[0].value, 20)
    assert.equal(promos[0].scope, 'PRODUCT')
    assert.equal(effectivePrice(Number(detail.basePrice), promos), 8)
  }

  // ── 5. Expire via direct DB update (no sleeping) ───────────────────────────
  await db.promotion.update({
    where: { id: created.id },
    data: { endsAt: new Date(Date.now() - 1_000) },
  })

  // ── 6. Expired: baseline behavior restored, effective price back to 10.00 ──
  {
    const { detail, promos } = await readPublic()
    assert.equal(Number(detail.basePrice), 10)
    assert.deepEqual(promos, [], 'expired promotion must drop out of the public reader')
    assert.equal(effectivePrice(Number(detail.basePrice), promos), 10)
  }
})
