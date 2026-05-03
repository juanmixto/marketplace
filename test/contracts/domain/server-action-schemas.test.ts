import test from 'node:test'
import assert from 'node:assert/strict'
import {
  productSchema,
  assertCompareAtPriceConsistent,
  PRODUCT_NAME_LIMITS,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_UNIT_LIMITS,
  PRODUCT_WEIGHT_MAX_GRAMS,
  PRODUCT_TAX_RATES,
  PRODUCT_VENDOR_SUBMIT_STATUSES,
} from '@/shared/types/products'
import {
  subscriptionPlanSchema,
  SUBSCRIPTION_CADENCES,
} from '@/shared/types/subscriptions'
import {
  promotionSchema,
  PROMOTION_KINDS,
  PROMOTION_SCOPES,
  PROMOTION_NAME_LIMITS,
  PROMOTION_CODE_MAX,
  PROMOTION_MAX_REDEMPTIONS_CAP,
  PROMOTION_PER_USER_LIMIT_CAP,
} from '@/shared/types/promotions'

/**
 * Schema-freeze for the three vendor-facing Server Action schemas
 * (vendor product CRUD + subscription plan + promotion). Companion
 * to the buyer-facing freezes in:
 *   - test/contracts/domain/snapshots.test.ts
 *   - test/contracts/domain/orders-schemas.test.ts
 *   - test/contracts/domain/profile-schema.test.ts
 *   - test/contracts/domain/auth-schemas.test.ts
 *   - test/contracts/domain/incidents-schemas.test.ts
 *
 * Server Actions are RPC stubs from the client form's POV: a silent
 * field rename / limit bump on the server side passes typecheck if
 * the client form imports `type FooInput` and the names still match,
 * but the form's UX (counter, max-length attribute, visible error)
 * gets out of sync with the actual constraint.
 */

function assertShape(
  label: string,
  schema: { _zod: { def: { shape: Record<string, { _zod: { optin?: string } }> } } },
  expected: { required: readonly string[]; optional: readonly string[] },
) {
  const shape = schema._zod.def.shape
  const actualKeys = Object.keys(shape).sort()
  const expectedKeys = [...expected.required, ...expected.optional].sort()

  assert.deepEqual(actualKeys, expectedKeys, `${label}: schema key set drifted.`)

  const required: string[] = []
  const optional: string[] = []
  for (const [key, field] of Object.entries(shape)) {
    const isOptional = field._zod.optin === 'optional'
    if (isOptional) optional.push(key)
    else required.push(key)
  }
  required.sort()
  optional.sort()

  assert.deepEqual(required, [...expected.required].sort(), `${label}: required drifted.`)
  assert.deepEqual(optional, [...expected.optional].sort(), `${label}: optional drifted.`)
}

// ─── Product (vendor CRUD) ────────────────────────────────────────────────────

test('productSchema — frozen shape', () => {
  assertShape('productSchema', productSchema as never, {
    required: ['name', 'basePrice', 'taxRate', 'unit', 'stock', 'trackStock'],
    optional: [
      'description',
      'categoryId',
      'compareAtPrice',
      'weightGrams',
      'certifications', // has .default([]) → optional input
      'originRegion',
      'images', // has .default([])
      'imageAlts', // #1049 — has .default([])
      'expiresAt',
      'status', // has .default('DRAFT')
    ],
  })
})

test('PRODUCT_*_LIMITS — frozen bounds', () => {
  assert.equal(PRODUCT_NAME_LIMITS.min, 3)
  assert.equal(PRODUCT_NAME_LIMITS.max, 100)
  assert.equal(PRODUCT_DESCRIPTION_MAX, 2000)
  assert.equal(PRODUCT_UNIT_LIMITS.min, 1)
  assert.equal(PRODUCT_UNIT_LIMITS.max, 20)
  assert.equal(PRODUCT_WEIGHT_MAX_GRAMS, 50_000)
})

test('PRODUCT_TAX_RATES — frozen ES IVA set', () => {
  // Tax-policy contract — adding/removing rates is a deliberate
  // accounting change. The freeze surfaces it.
  assert.deepEqual([...PRODUCT_TAX_RATES], [0.04, 0.10, 0.21])
})

test('PRODUCT_VENDOR_SUBMIT_STATUSES — frozen vendor-side enum', () => {
  // ACTIVE / REJECTED / SUSPENDED are admin transitions; if a vendor
  // could submit those directly they'd bypass moderation.
  assert.deepEqual([...PRODUCT_VENDOR_SUBMIT_STATUSES], ['DRAFT', 'PENDING_REVIEW'])
})

test('productSchema — rejects an unknown IVA rate', () => {
  const result = productSchema.safeParse({
    name: 'Aceite',
    basePrice: 10,
    taxRate: 0.15, // not in the legal Spanish set
    unit: 'L',
    stock: 5,
    trackStock: true,
  })
  assert.equal(result.success, false)
})

test('productSchema — rejects a vendor-submitted ACTIVE status', () => {
  const result = productSchema.safeParse({
    name: 'Aceite',
    basePrice: 10,
    taxRate: 0.10,
    unit: 'L',
    stock: 5,
    trackStock: true,
    status: 'ACTIVE',
  })
  assert.equal(result.success, false)
})

test('productSchema — rejects NaN basePrice (zMoneyEUR preprocess)', () => {
  // The previous `z.coerce.number().positive()` happily coerced "abc" to NaN;
  // the new zMoneyEUR rejects NaN explicitly via `.finite()`.
  const result = productSchema.safeParse({
    name: 'Aceite',
    basePrice: 'abc',
    taxRate: 0.10,
    unit: 'L',
    stock: 5,
    trackStock: true,
  })
  assert.equal(result.success, false)
})

test('assertCompareAtPriceConsistent — accepts compareAtPrice >= basePrice', () => {
  assertCompareAtPriceConsistent({ basePrice: 10, compareAtPrice: 12 })
  assertCompareAtPriceConsistent({ basePrice: 10, compareAtPrice: 10 })
  assertCompareAtPriceConsistent({ basePrice: 10, compareAtPrice: null })
  assertCompareAtPriceConsistent({ basePrice: 10 }) // compareAtPrice undefined
})

test('assertCompareAtPriceConsistent — rejects compareAtPrice < basePrice', () => {
  assert.throws(
    () => assertCompareAtPriceConsistent({ basePrice: 10, compareAtPrice: 5 }),
    /compareAtPrice/,
  )
})

// ─── Subscription plan (vendor creates) ───────────────────────────────────────

test('subscriptionPlanSchema — frozen shape', () => {
  assertShape('subscriptionPlanSchema', subscriptionPlanSchema as never, {
    required: ['productId', 'cadence', 'cutoffDayOfWeek'],
    optional: [],
  })
})

test('SUBSCRIPTION_CADENCES — frozen set', () => {
  // Adding a cadence here means: new database column behavior, new
  // billing window, and probably a new Stripe price. Make it loud.
  assert.deepEqual([...SUBSCRIPTION_CADENCES], ['WEEKLY', 'BIWEEKLY', 'MONTHLY'])
})

test('subscriptionPlanSchema — rejects out-of-range cutoffDayOfWeek', () => {
  const result = subscriptionPlanSchema.safeParse({
    productId: 'p_1',
    cadence: 'WEEKLY',
    cutoffDayOfWeek: 7,
  })
  assert.equal(result.success, false)
})

// ─── Promotion (vendor CRUD) ──────────────────────────────────────────────────

test('promotionSchema — frozen shape', () => {
  assertShape('promotionSchema', promotionSchema as never, {
    required: ['name', 'kind', 'value', 'scope', 'startsAt', 'endsAt'],
    optional: [
      'code',
      'productId',
      'categoryId',
      'minSubtotal',
      'maxRedemptions',
      'perUserLimit',
    ],
  })
})

test('PROMOTION_KINDS / PROMOTION_SCOPES — frozen sets', () => {
  assert.deepEqual([...PROMOTION_KINDS], ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING'])
  assert.deepEqual([...PROMOTION_SCOPES], ['PRODUCT', 'VENDOR', 'CATEGORY'])
})

test('PROMOTION_*_LIMITS — frozen bounds', () => {
  assert.equal(PROMOTION_NAME_LIMITS.min, 3)
  assert.equal(PROMOTION_NAME_LIMITS.max, 100)
  assert.equal(PROMOTION_CODE_MAX, 40)
  assert.equal(PROMOTION_MAX_REDEMPTIONS_CAP, 1_000_000)
  assert.equal(PROMOTION_PER_USER_LIMIT_CAP, 1_000)
})

test('promotionSchema — PRODUCT scope without productId is rejected', () => {
  const result = promotionSchema.safeParse({
    name: 'Test promo',
    kind: 'PERCENTAGE',
    value: 10,
    scope: 'PRODUCT',
    startsAt: '2026-01-01',
    endsAt: '2026-12-31',
  })
  assert.equal(result.success, false)
  if (!result.success) {
    assert.ok(
      result.error.issues.some(i => i.path[0] === 'productId'),
      'expected an issue on productId path',
    )
  }
})

test('promotionSchema — PERCENTAGE > 100 is rejected', () => {
  const result = promotionSchema.safeParse({
    name: 'Test promo',
    kind: 'PERCENTAGE',
    value: 150,
    scope: 'VENDOR',
    startsAt: '2026-01-01',
    endsAt: '2026-12-31',
  })
  assert.equal(result.success, false)
})

test('promotionSchema — endsAt before startsAt is rejected', () => {
  const result = promotionSchema.safeParse({
    name: 'Test promo',
    kind: 'PERCENTAGE',
    value: 10,
    scope: 'VENDOR',
    startsAt: '2026-12-31',
    endsAt: '2026-01-01',
  })
  assert.equal(result.success, false)
})

test('promotionSchema — VENDOR scope with a productId is rejected', () => {
  const result = promotionSchema.safeParse({
    name: 'Test promo',
    kind: 'PERCENTAGE',
    value: 10,
    scope: 'VENDOR',
    productId: 'p_1',
    startsAt: '2026-01-01',
    endsAt: '2026-12-31',
  })
  assert.equal(result.success, false)
})
