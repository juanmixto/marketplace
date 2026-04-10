import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateOrderPricing, calculateOrderTotals, calculateOrderTotalsWithShippingCost, checkoutSchema, getIncludedTaxAmount } from '@/domains/orders/checkout'
import { resolveMarketplaceSettings } from '@/lib/marketplace-settings'
import { calculateShippingCostFromTables, getProvinceFromPostalCode } from '@/domains/shipping/shared'

test('calculateOrderTotals keeps tax included in subtotal and only adds shipping once', () => {
  const totals = calculateOrderTotals([
    { unitPrice: 3.5, quantity: 2, taxRate: 0.04 },
    { unitPrice: 12, quantity: 1, taxRate: 0.1 },
  ])

  assert.deepEqual(totals, {
    subtotal: 19,
    taxAmount: 1.36,
    shippingCost: 4.95,
    grandTotal: 23.95,
  })
})

test('calculateOrderTotals keeps the default flat shipping fallback', () => {
  const totals = calculateOrderTotals([
    { unitPrice: 18, quantity: 2, taxRate: 0.1 },
  ])

  assert.equal(totals.subtotal, 36)
  assert.equal(totals.shippingCost, 4.95)
  assert.equal(totals.grandTotal, 40.95)
})

test('calculateOrderTotalsWithShippingCost uses provided shipping cost', () => {
  const totals = calculateOrderTotalsWithShippingCost(
    [{ unitPrice: 18, quantity: 2, taxRate: 0.1 }],
    7.5
  )

  assert.equal(totals.subtotal, 36)
  assert.equal(totals.shippingCost, 7.5)
  assert.equal(totals.grandTotal, 43.5)
})

test('calculateOrderPricing returns subtotal and tax before shipping is added', () => {
  const pricing = calculateOrderPricing([
    { unitPrice: 10, quantity: 2, taxRate: 0.1 },
    { unitPrice: 4, quantity: 1, taxRate: 0.04 },
  ])

  assert.deepEqual(pricing, {
    subtotal: 24,
    taxAmount: 1.97,
  })
})

test('getIncludedTaxAmount derives VAT portion from gross price', () => {
  assert.equal(getIncludedTaxAmount(12, 1, 0.1), 1.09)
  assert.equal(getIncludedTaxAmount(3.5, 2, 0.04), 0.27)
})

test('checkoutSchema keeps saveAddress at top level and strips it from address payload', () => {
  const parsed = checkoutSchema.parse({
    address: {
      firstName: 'Ana',
      lastName: 'López',
      line1: 'Calle Mayor 12',
      city: 'Madrid',
      province: 'Madrid',
      postalCode: '28001',
      phone: '600000000',
      saveAddress: true,
    },
    saveAddress: true,
  })

  assert.equal(parsed.saveAddress, true)
  assert.equal('saveAddress' in parsed.address, false)
  assert.deepEqual(parsed.address, {
    firstName: 'Ana',
    lastName: 'López',
    line1: 'Calle Mayor 12',
    city: 'Madrid',
    province: 'Madrid',
    postalCode: '28001',
    phone: '600000000',
  })
})

test('resolveMarketplaceSettings accepts canonical keys and legacy aliases', () => {
  const resolved = resolveMarketplaceSettings([
    { key: 'commission_default', value: 0.15 },
    { key: 'FREE_SHIPPING_THRESHOLD', value: 49 },
    { key: 'flat_shipping_cost', value: 6.25 },
    { key: 'MAINTENANCE_MODE', value: true },
    { key: 'hero_banner_text', value: 'Promo de primavera' },
  ])

  assert.deepEqual(resolved, {
    DEFAULT_COMMISSION_RATE: 0.15,
    FREE_SHIPPING_THRESHOLD: 49,
    FLAT_SHIPPING_COST: 6.25,
    MAINTENANCE_MODE: true,
    HERO_BANNER_TEXT: 'Promo de primavera',
  })
})

test('getProvinceFromPostalCode maps Spanish postal prefixes correctly', () => {
  assert.equal(getProvinceFromPostalCode('28001'), 'Madrid')
  assert.equal(getProvinceFromPostalCode('41001'), 'Sevilla')
})

test('calculateShippingCostFromTables uses matching zone and free-above thresholds', () => {
  const shippingCost = calculateShippingCostFromTables({
    postalCode: '28001',
    subtotal: 40,
    fallbackCost: 4.95,
    zones: [{ id: 'peninsula', name: 'Península', provinces: ['28', 'Madrid'], isActive: true }],
    rates: [{ zoneId: 'peninsula', name: 'Estándar', minOrderAmount: 0, price: 4.95, freeAbove: 35, isActive: true }],
  })

  assert.equal(shippingCost, 0)
})

test('calculateShippingCostFromTables falls back when there is no configured zone', () => {
  const shippingCost = calculateShippingCostFromTables({
    postalCode: '51001',
    subtotal: 20,
    fallbackCost: 4.95,
    zones: [{ id: 'peninsula', name: 'Península', provinces: ['28'], isActive: true }],
    rates: [{ zoneId: 'peninsula', name: 'Estándar', minOrderAmount: 0, price: 4.95, freeAbove: 35, isActive: true }],
  })

  assert.equal(shippingCost, 4.95)
})
