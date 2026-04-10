import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateCommissionAmount,
  resolveEffectiveCommissionRate,
} from '@/domains/finance/commission'

test('resolveEffectiveCommissionRate prioritizes vendor-specific rules over category and fallback', async () => {
  const rate = await resolveEffectiveCommissionRate('vendor-1', 'cat-1', {
    vendorRate: 0.1,
    rules: [
      { vendorId: null, categoryId: 'cat-1', type: 'PERCENTAGE', rate: 0.08, isActive: true },
      { vendorId: 'vendor-1', categoryId: null, type: 'PERCENTAGE', rate: 0.05, isActive: true },
    ],
  })

  assert.equal(rate, 0.05)
})

test('resolveEffectiveCommissionRate falls back to category rule when there is no vendor rule', async () => {
  const rate = await resolveEffectiveCommissionRate('vendor-1', 'cat-1', {
    vendorRate: 0.1,
    rules: [
      { vendorId: null, categoryId: 'cat-1', type: 'PERCENTAGE', rate: 0.07, isActive: true },
    ],
  })

  assert.equal(rate, 0.07)
})

test('resolveEffectiveCommissionRate ignores inactive rules and falls back to vendor rate', async () => {
  const rate = await resolveEffectiveCommissionRate('vendor-1', 'cat-1', {
    vendorRate: 0.12,
    rules: [
      { vendorId: 'vendor-1', categoryId: null, type: 'PERCENTAGE', rate: 0.03, isActive: false },
      { vendorId: null, categoryId: 'cat-1', type: 'PERCENTAGE', rate: 0.02, isActive: false },
    ],
  })

  assert.equal(rate, 0.12)
})

test('resolveEffectiveCommissionRate falls back to vendor base rate when no rule matches', async () => {
  const rate = await resolveEffectiveCommissionRate('vendor-1', 'cat-1', {
    vendorRate: 0.09,
    rules: [
      { vendorId: 'vendor-2', categoryId: null, type: 'PERCENTAGE', rate: 0.04, isActive: true },
    ],
  })

  assert.equal(rate, 0.09)
})

test('calculateCommissionAmount supports percentage and fixed rules', () => {
  assert.equal(calculateCommissionAmount({ grossSales: 100, commissionType: 'PERCENTAGE', commissionRate: 0.12 }), 12)
  assert.equal(calculateCommissionAmount({ grossSales: 100, commissionType: 'FIXED', commissionRate: 4.95 }), 4.95)
})

test('resolveEffectiveCommissionRate with no categoryId skips category rules and falls back to vendor rate', async () => {
  const rate = await resolveEffectiveCommissionRate('vendor-1', undefined, {
    vendorRate: 0.15,
    rules: [
      { vendorId: null, categoryId: 'cat-1', type: 'PERCENTAGE', rate: 0.05, isActive: true },
    ],
  })

  // Category rule is irrelevant when categoryId is not provided
  assert.equal(rate, 0.15)
})

test('resolveEffectiveCommissionRate vendor rule takes priority even when category rule has lower rate', async () => {
  const rate = await resolveEffectiveCommissionRate('vendor-1', 'cat-1', {
    vendorRate: 0.2,
    rules: [
      { vendorId: 'vendor-1', categoryId: null, type: 'PERCENTAGE', rate: 0.18, isActive: true },
      { vendorId: null, categoryId: 'cat-1', type: 'PERCENTAGE', rate: 0.05, isActive: true },
    ],
  })

  assert.equal(rate, 0.18)
})

test('calculateCommissionAmount rounds to 2 decimal places', () => {
  // 100 * 0.123 = 12.3 → 12.30 (already 2 decimals)
  assert.equal(calculateCommissionAmount({ grossSales: 100, commissionType: 'PERCENTAGE', commissionRate: 0.123 }), 12.3)
  // 33.33 * 0.1 = 3.333 → 3.33
  assert.equal(calculateCommissionAmount({ grossSales: 33.33, commissionType: 'PERCENTAGE', commissionRate: 0.1 }), 3.33)
})
