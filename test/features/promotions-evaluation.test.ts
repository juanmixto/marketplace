import test from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluatePromotions,
  vendorSubtotals,
  type EvaluableCartLine,
  type EvaluablePromotion,
} from '@/domains/promotions/evaluation'

/**
 * Phase 2 of the promotions RFC — pure evaluation engine.
 * Every test here works against plain data structures, no DB.
 */

const VENDOR_A = 'vendor-a'
const VENDOR_B = 'vendor-b'

function line(overrides: Partial<EvaluableCartLine> = {}): EvaluableCartLine {
  return {
    productId: 'prod-1',
    vendorId: VENDOR_A,
    categoryId: 'cat-1',
    quantity: 1,
    unitPrice: 10,
    ...overrides,
  }
}

function promo(overrides: Partial<EvaluablePromotion> = {}): EvaluablePromotion {
  return {
    id: 'promo-1',
    vendorId: VENDOR_A,
    kind: 'PERCENTAGE',
    scope: 'VENDOR',
    value: 10,
    code: null,
    productId: null,
    categoryId: null,
    minSubtotal: null,
    maxRedemptions: null,
    redemptionCount: 0,
    perUserLimit: null,
    startsAt: new Date('2026-01-01'),
    endsAt: new Date('2026-12-31'),
    archivedAt: null,
    ...overrides,
  }
}

const fixedNow = new Date('2026-04-15')

test('vendorSubtotals sums line.unitPrice * quantity per vendor', () => {
  const subs = vendorSubtotals([
    line({ vendorId: VENDOR_A, quantity: 2, unitPrice: 10 }),
    line({ vendorId: VENDOR_A, quantity: 1, unitPrice: 5 }),
    line({ vendorId: VENDOR_B, quantity: 3, unitPrice: 4 }),
  ])
  assert.equal(subs.get(VENDOR_A), 25)
  assert.equal(subs.get(VENDOR_B), 12)
})

test('no promotions → empty result', () => {
  const result = evaluatePromotions({
    lines: [line()],
    promotions: [],
    now: fixedNow,
  })
  assert.equal(result.applied.size, 0)
  assert.equal(result.subtotalDiscount, 0)
  assert.equal(result.shippingDiscount, 0)
  assert.deepEqual(result.unknownCodes, [])
})

test('PERCENTAGE auto-promo applied to vendor-wide cart', () => {
  const result = evaluatePromotions({
    lines: [line({ quantity: 2, unitPrice: 10 })], // subtotal 20
    promotions: [promo({ value: 25 })], // 25%
    now: fixedNow,
  })
  assert.equal(result.applied.size, 1)
  const applied = result.applied.get(VENDOR_A)!
  assert.equal(applied.promotionId, 'promo-1')
  assert.equal(applied.discountAmount, 5) // 25% of 20
  assert.equal(applied.kind, 'PERCENTAGE')
  assert.equal(applied.reasonCode, 'auto')
  assert.equal(result.subtotalDiscount, 5)
})

test('FIXED_AMOUNT promo never exceeds applicable subtotal', () => {
  const result = evaluatePromotions({
    lines: [line({ unitPrice: 5 })],
    promotions: [promo({ kind: 'FIXED_AMOUNT', value: 999 })],
    now: fixedNow,
  })
  const applied = result.applied.get(VENDOR_A)!
  assert.equal(applied.discountAmount, 5)
})

test('PRODUCT-scoped promo discounts only the matching line', () => {
  const result = evaluatePromotions({
    lines: [
      line({ productId: 'p-target', unitPrice: 10 }),
      line({ productId: 'p-other',  unitPrice: 10 }),
    ],
    promotions: [
      promo({
        scope: 'PRODUCT',
        productId: 'p-target',
        kind: 'PERCENTAGE',
        value: 50,
      }),
    ],
    now: fixedNow,
  })
  const applied = result.applied.get(VENDOR_A)!
  assert.equal(applied.discountAmount, 5) // 50% of the 10€ line only
})

test('CATEGORY-scoped promo discounts only lines in that category', () => {
  const result = evaluatePromotions({
    lines: [
      line({ productId: 'p-1', categoryId: 'cat-target', unitPrice: 20 }),
      line({ productId: 'p-2', categoryId: 'cat-other',  unitPrice: 20 }),
    ],
    promotions: [
      promo({
        scope: 'CATEGORY',
        categoryId: 'cat-target',
        kind: 'FIXED_AMOUNT',
        value: 7,
      }),
    ],
    now: fixedNow,
  })
  assert.equal(result.applied.get(VENDOR_A)?.discountAmount, 7)
})

test('archived promotion is never applied', () => {
  const result = evaluatePromotions({
    lines: [line()],
    promotions: [promo({ archivedAt: new Date('2026-01-01') })],
    now: fixedNow,
  })
  assert.equal(result.applied.size, 0)
})

test('promotion outside the date window is never applied', () => {
  const beforeStart = evaluatePromotions({
    lines: [line()],
    promotions: [promo({ startsAt: new Date('2099-01-01') })],
    now: fixedNow,
  })
  const afterEnd = evaluatePromotions({
    lines: [line()],
    promotions: [promo({ endsAt: new Date('2020-01-01') })],
    now: fixedNow,
  })
  assert.equal(beforeStart.applied.size, 0)
  assert.equal(afterEnd.applied.size, 0)
})

test('minSubtotal guard skips promos below threshold', () => {
  const result = evaluatePromotions({
    lines: [line({ unitPrice: 10 })], // subtotal 10
    promotions: [promo({ minSubtotal: 20 })],
    now: fixedNow,
  })
  assert.equal(result.applied.size, 0)
})

test('maxRedemptions exhausted → promo is skipped', () => {
  const result = evaluatePromotions({
    lines: [line()],
    promotions: [promo({ maxRedemptions: 10, redemptionCount: 10 })],
    now: fixedNow,
  })
  assert.equal(result.applied.size, 0)
})

test('perUserLimit exhausted → promo is skipped', () => {
  const buyerRedemptions = new Map([['promo-1', 2]])
  const result = evaluatePromotions({
    lines: [line()],
    promotions: [promo({ perUserLimit: 2 })],
    now: fixedNow,
    buyerRedemptionsByPromotionId: buyerRedemptions,
  })
  assert.equal(result.applied.size, 0)
})

test('the biggest eligible discount wins per vendor (no stacking)', () => {
  const result = evaluatePromotions({
    lines: [line({ quantity: 1, unitPrice: 100 })],
    promotions: [
      promo({ id: 'small', value: 5 }), // 5€
      promo({ id: 'big', value: 40 }), // 40€
    ],
    now: fixedNow,
  })
  const applied = result.applied.get(VENDOR_A)!
  assert.equal(applied.promotionId, 'big')
  assert.equal(applied.discountAmount, 40)
})

test('coded promo ignored unless the buyer enters the matching code', () => {
  const lines = [line({ quantity: 1, unitPrice: 100 })]
  const promos = [promo({ id: 'secret', code: 'SECRET10', value: 20 })]

  const withoutCode = evaluatePromotions({ lines, promotions: promos, now: fixedNow })
  assert.equal(withoutCode.applied.size, 0)

  const withWrongCode = evaluatePromotions({
    lines, promotions: promos, now: fixedNow, code: 'WRONG',
  })
  assert.equal(withWrongCode.applied.size, 0)
  assert.deepEqual(withWrongCode.unknownCodes, ['WRONG'])

  const withCode = evaluatePromotions({
    lines, promotions: promos, now: fixedNow, code: 'secret10',
  })
  assert.equal(withCode.applied.size, 1)
  const applied = withCode.applied.get(VENDOR_A)!
  assert.equal(applied.reasonCode, 'code')
})

test('buyer-entered code beats an auto-promo if it is a better deal', () => {
  const result = evaluatePromotions({
    lines: [line({ quantity: 1, unitPrice: 100 })],
    promotions: [
      promo({ id: 'auto', value: 5 }),
      promo({ id: 'coded', code: 'BIG30', value: 30 }),
    ],
    now: fixedNow,
    code: 'BIG30',
  })
  assert.equal(result.applied.get(VENDOR_A)?.promotionId, 'coded')
  assert.equal(result.applied.get(VENDOR_A)?.discountAmount, 30)
})

test('auto-promo wins when the buyer-entered code is the smaller deal', () => {
  const result = evaluatePromotions({
    lines: [line({ quantity: 1, unitPrice: 100 })],
    promotions: [
      promo({ id: 'auto', value: 40 }),
      promo({ id: 'coded', code: 'SMALL5', value: 5 }),
    ],
    now: fixedNow,
    code: 'SMALL5',
  })
  assert.equal(result.applied.get(VENDOR_A)?.promotionId, 'auto')
  // Buyer still got the best deal, so the code is not reported as unknown.
  assert.deepEqual(result.applied.get(VENDOR_A)?.reasonCode, 'auto')
})

test('multi-vendor cart applies one promo per vendor independently', () => {
  const lines = [
    line({ vendorId: VENDOR_A, unitPrice: 50 }),
    line({ vendorId: VENDOR_B, unitPrice: 80 }),
  ]
  const promotions: EvaluablePromotion[] = [
    promo({ id: 'a', vendorId: VENDOR_A, value: 20 }), // 10 off
    promo({ id: 'b', vendorId: VENDOR_B, kind: 'FIXED_AMOUNT', value: 15 }), // 15 off
  ]
  const result = evaluatePromotions({ lines, promotions, now: fixedNow })

  assert.equal(result.applied.size, 2)
  assert.equal(result.applied.get(VENDOR_A)?.discountAmount, 10)
  assert.equal(result.applied.get(VENDOR_B)?.discountAmount, 15)
  assert.equal(result.subtotalDiscount, 25)
})

test('a vendor without an eligible promo does not block other vendors', () => {
  const lines = [
    line({ vendorId: VENDOR_A, unitPrice: 50 }),
    line({ vendorId: VENDOR_B, unitPrice: 80 }),
  ]
  const promotions: EvaluablePromotion[] = [
    promo({ id: 'b', vendorId: VENDOR_B, value: 10 }),
  ]
  const result = evaluatePromotions({ lines, promotions, now: fixedNow })
  assert.equal(result.applied.size, 1)
  assert.equal(result.applied.get(VENDOR_B)?.discountAmount, 8)
})

test('FREE_SHIPPING applied in a single-vendor cart zeroes shipping', () => {
  const result = evaluatePromotions({
    lines: [line({ unitPrice: 50 })],
    promotions: [promo({ kind: 'FREE_SHIPPING', value: 0 })],
    now: fixedNow,
    shippingCost: 4.95,
  })
  const applied = result.applied.get(VENDOR_A)!
  assert.equal(applied.kind, 'FREE_SHIPPING')
  assert.equal(applied.discountAmount, 0)
  assert.equal(applied.shippingDiscount, 4.95)
  assert.equal(result.shippingDiscount, 4.95)
})

test('FREE_SHIPPING is skipped in a multi-vendor cart', () => {
  const lines = [
    line({ vendorId: VENDOR_A, unitPrice: 30 }),
    line({ vendorId: VENDOR_B, unitPrice: 30 }),
  ]
  const promotions: EvaluablePromotion[] = [
    promo({ id: 'a', vendorId: VENDOR_A, kind: 'FREE_SHIPPING', value: 0 }),
  ]
  const result = evaluatePromotions({
    lines, promotions, now: fixedNow, shippingCost: 4.95,
  })
  assert.equal(result.applied.size, 0)
  assert.equal(result.shippingDiscount, 0)
})

test('PERCENTAGE beats FIXED_AMOUNT when it produces a larger discount', () => {
  const result = evaluatePromotions({
    lines: [line({ unitPrice: 100 })],
    promotions: [
      promo({ id: 'fixed', kind: 'FIXED_AMOUNT', value: 5 }),
      promo({ id: 'percent', kind: 'PERCENTAGE', value: 20 }),
    ],
    now: fixedNow,
  })
  assert.equal(result.applied.get(VENDOR_A)?.promotionId, 'percent')
  assert.equal(result.applied.get(VENDOR_A)?.discountAmount, 20)
})

test('PERCENTAGE value is clamped at the applicable subtotal (no negative totals)', () => {
  const result = evaluatePromotions({
    lines: [line({ unitPrice: 10 })],
    promotions: [promo({ value: 200 })], // pathological > 100
    now: fixedNow,
  })
  assert.equal(result.applied.get(VENDOR_A)?.discountAmount, 10)
})

test('unknown codes are reported only when no promo in the pool matches', () => {
  const lines = [line()]
  const promos = [promo({ code: 'KNOWN', value: 10 })]

  const unknown = evaluatePromotions({
    lines, promotions: promos, now: fixedNow, code: 'UNKNOWN',
  })
  assert.deepEqual(unknown.unknownCodes, ['UNKNOWN'])

  const known = evaluatePromotions({
    lines, promotions: promos, now: fixedNow, code: 'KNOWN',
  })
  assert.deepEqual(known.unknownCodes, [])
})
