import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateOrderTotals, calculateOrderTotalsWithConfig, checkoutSchema, getIncludedTaxAmount } from '@/domains/orders/checkout'
import { resolveMarketplaceSettings } from '@/lib/marketplace-settings'

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

test('calculateOrderTotals applies free shipping threshold', () => {
  const totals = calculateOrderTotals([
    { unitPrice: 18, quantity: 2, taxRate: 0.1 },
  ])

  assert.equal(totals.subtotal, 36)
  assert.equal(totals.shippingCost, 0)
  assert.equal(totals.grandTotal, 36)
})

test('calculateOrderTotalsWithConfig uses dynamic shipping settings', () => {
  const totals = calculateOrderTotalsWithConfig(
    [{ unitPrice: 18, quantity: 2, taxRate: 0.1 }],
    { FREE_SHIPPING_THRESHOLD: 50, FLAT_SHIPPING_COST: 7.5 }
  )

  assert.equal(totals.subtotal, 36)
  assert.equal(totals.shippingCost, 7.5)
  assert.equal(totals.grandTotal, 43.5)
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
