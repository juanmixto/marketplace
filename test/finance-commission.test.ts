import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateCommissionAmount,
  resolveCommissionRate,
  resolveCommissionRule,
} from '@/domains/finance/commission'

test('resolveCommissionRate prioritizes vendor-specific rules over category and fallback', () => {
  const rate = resolveCommissionRate({
    vendorId: 'vendor-1',
    categoryId: 'cat-1',
    vendorRate: 0.1,
    rules: [
      { vendorId: null, categoryId: 'cat-1', type: 'PERCENTAGE', rate: 0.08, isActive: true },
      { vendorId: 'vendor-1', categoryId: null, type: 'PERCENTAGE', rate: 0.05, isActive: true },
    ],
  })

  assert.equal(rate, 0.05)
})

test('resolveCommissionRate falls back to category rule when there is no vendor rule', () => {
  const rate = resolveCommissionRate({
    vendorId: 'vendor-1',
    categoryId: 'cat-1',
    vendorRate: 0.1,
    rules: [
      { vendorId: null, categoryId: 'cat-1', type: 'PERCENTAGE', rate: 0.07, isActive: true },
    ],
  })

  assert.equal(rate, 0.07)
})

test('resolveCommissionRate ignores inactive rules and falls back to vendor rate', () => {
  const rate = resolveCommissionRate({
    vendorId: 'vendor-1',
    categoryId: 'cat-1',
    vendorRate: 0.12,
    rules: [
      { vendorId: 'vendor-1', categoryId: null, type: 'PERCENTAGE', rate: 0.03, isActive: false },
      { vendorId: null, categoryId: 'cat-1', type: 'PERCENTAGE', rate: 0.02, isActive: false },
    ],
  })

  assert.equal(rate, 0.12)
})

test('resolveCommissionRule returns null when no active rule matches', () => {
  const rule = resolveCommissionRule({
    vendorId: 'vendor-1',
    categoryId: 'cat-1',
    rules: [
      { vendorId: 'vendor-2', categoryId: null, type: 'PERCENTAGE', rate: 0.04, isActive: true },
    ],
  })

  assert.equal(rule, null)
})

test('calculateCommissionAmount supports percentage and fixed rules', () => {
  assert.equal(calculateCommissionAmount({ grossSales: 100, commissionType: 'PERCENTAGE', commissionRate: 0.12 }), 12)
  assert.equal(calculateCommissionAmount({ grossSales: 100, commissionType: 'FIXED', commissionRate: 4.95 }), 4.95)
})
