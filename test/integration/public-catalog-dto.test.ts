import test from 'node:test'
import assert from 'node:assert/strict'
import { PUBLIC_VENDOR_SELECT, PUBLIC_VARIANT_SELECT } from '@/domains/catalog/public-selects'

/**
 * Issue #590: public catalog queries must not leak sensitive vendor
 * fields (iban, bankAccountName, stripeAccountId, commissionRate,
 * etc.). PUBLIC_VENDOR_SELECT is the allow-list that
 * getVendors / getVendorBySlug / getProductBySlug use to scope the
 * Prisma select. This test pins that list so a future diff that
 * adds, say, `iban: true` on the public surface will fail CI.
 *
 * If a new field is genuinely safe to expose publicly, update this
 * test alongside the query in a single PR so the review is explicit.
 */

const FORBIDDEN_VENDOR_FIELDS = [
  'userId',
  'iban',
  'bankAccountName',
  'stripeAccountId',
  'stripeOnboarded',
  'commissionRate',
  'preferredShippingProvider',
  'status',
  'updatedAt',
] as const

const FORBIDDEN_VARIANT_FIELDS = ['sku', 'productId', 'createdAt', 'updatedAt'] as const

test('PUBLIC_VENDOR_SELECT contains no sensitive vendor fields', () => {
  for (const field of FORBIDDEN_VENDOR_FIELDS) {
    assert.equal(
      (PUBLIC_VENDOR_SELECT as Record<string, unknown>)[field],
      undefined,
      `PUBLIC_VENDOR_SELECT leaks ${field}. This field would be serialized to any buyer / anon page that fetches a vendor. Remove it or move the caller behind an auth boundary.`,
    )
  }
})

test('PUBLIC_VENDOR_SELECT pins the expected field set', () => {
  // Snapshot of the current public fields. Growing this set is a
  // security decision — widen the snapshot AND document why in the
  // PUBLIC_VENDOR_SELECT comment.
  const expected = [
    'id',
    'slug',
    'displayName',
    'description',
    'logo',
    'logoAlt',
    'coverImage',
    'coverImageAlt',
    'location',
    'category',
    'avgRating',
    'totalReviews',
    'orderCutoffTime',
    'preparationDays',
    'createdAt',
  ].sort()
  const actual = Object.keys(PUBLIC_VENDOR_SELECT).sort()
  assert.deepEqual(
    actual,
    expected,
    'PUBLIC_VENDOR_SELECT field set changed. If intentional, update this test and document why in src/domains/catalog/queries.ts.',
  )
})

test('PUBLIC_VARIANT_SELECT keeps internal SKU off the public surface', () => {
  for (const field of FORBIDDEN_VARIANT_FIELDS) {
    assert.equal(
      (PUBLIC_VARIANT_SELECT as Record<string, unknown>)[field],
      undefined,
      `PUBLIC_VARIANT_SELECT leaks ${field}. Buyers should not see internal variant plumbing.`,
    )
  }
})
