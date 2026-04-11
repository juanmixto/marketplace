import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  calculateOrderPricing,
  calculateOrderTotals,
  calculateOrderTotalsWithShippingCost,
  checkoutSchema,
  getIncludedTaxAmount,
  getPreferredCheckoutAddress,
  orderItemsSchema,
  toCheckoutFormAddress,
} from '@/domains/orders/checkout'
import { resolveMarketplaceSettings, toPublicMarketplaceSettings, calculateShippingCost, MARKETPLACE_SETTINGS_DEFAULTS } from '@/lib/marketplace-settings'
import { calculateShippingCostFromTables, getProvinceFromPostalCode } from '@/domains/shipping/shared'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

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

test('getPreferredCheckoutAddress prioritizes the default saved address', () => {
  const preferred = getPreferredCheckoutAddress([
    {
      id: 'addr_1',
      firstName: 'Ana',
      lastName: 'López',
      line1: 'Calle A',
      city: 'Madrid',
      province: 'Madrid',
      postalCode: '28001',
      isDefault: false,
    },
    {
      id: 'addr_2',
      firstName: 'Luis',
      lastName: 'Pérez',
      line1: 'Calle B',
      city: 'Sevilla',
      province: 'Sevilla',
      postalCode: '41001',
      isDefault: true,
    },
  ])

  assert.equal(preferred?.id, 'addr_2')
})

test('toCheckoutFormAddress maps a saved address into checkout form values', () => {
  const formAddress = toCheckoutFormAddress({
    id: 'addr_1',
    firstName: 'Ana',
    lastName: 'López',
    line1: 'Calle Mayor 12',
    line2: null,
    city: 'Madrid',
    province: 'Madrid',
    postalCode: '28001',
    phone: null,
    isDefault: true,
  })

  assert.deepEqual(formAddress, {
    firstName: 'Ana',
    lastName: 'López',
    line1: 'Calle Mayor 12',
    line2: '',
    city: 'Madrid',
    province: 'Madrid',
    postalCode: '28001',
    phone: '',
    saveAddress: false,
  })
})

test('checkout success redirects to the confirmation page instead of leaving the buyer without feedback', () => {
  const checkoutClient = readSource('../src/components/buyer/CheckoutPageClient.tsx')
  const stripeForm = readSource('../src/components/checkout/StripeCheckoutForm.tsx')

  assert.match(checkoutClient, /\/checkout\/confirmacion\?orderNumber=/)
  assert.match(stripeForm, /\/checkout\/confirmacion\?orderNumber=/)
})

test('checkout client avoids the empty-cart fallback while the confirmation redirect is in flight', () => {
  const checkoutClient = readSource('../src/components/buyer/CheckoutPageClient.tsx')

  assert.match(checkoutClient, /setCompletedOrderNumber\(orderNumber\)/)
  assert.match(checkoutClient, /items\.length === 0 && step !== 'processing' && !completedOrderNumber/)
})

test('checkout new-address form is collapsed by default when saved addresses exist', () => {
  const checkoutClient = readSource('../src/components/buyer/CheckoutPageClient.tsx')

  assert.match(checkoutClient, /showNewAddressForm/, 'showNewAddressForm state must exist')
  assert.match(checkoutClient, /setShowNewAddressForm\(false\)/, 'must collapse form when a saved address is selected')
  assert.match(checkoutClient, /setShowNewAddressForm\(true\)/, 'must expand form on handleUseNewAddress')
  assert.match(checkoutClient, /showNewAddressForm \|\| \(/, 'form must be conditionally rendered')
})

test('DireccionesClient clears isDefault on sibling addresses when a new default is saved', () => {
  const src = readSource('../src/app/(buyer)/cuenta/direcciones/DireccionesClient.tsx')

  assert.match(src, /savedAddress\.isDefault/, 'must check savedAddress.isDefault')
  assert.match(src, /isDefault: false/, 'must clear isDefault on siblings')
})

test('DireccionesClient skips the map pass when saved address is not default', () => {
  const src = readSource('../src/app/(buyer)/cuenta/direcciones/DireccionesClient.tsx')

  // Pattern: const base = savedAddress.isDefault ? addresses.map(...) : addresses
  assert.match(src, /savedAddress\.isDefault[\s\S]{0,60}addresses\.map/, 'must only map when isDefault is true')
})

test('catalog revalidation uses immediate tag expiry so buyers see stock updates right away', () => {
  const revalidateSource = readSource('../src/lib/revalidate.ts')

  assert.match(revalidateSource, /updateTag\(tag\)/)
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

test('orderItemsSchema rejects an empty cart', () => {
  const result = orderItemsSchema.safeParse([])

  assert.equal(result.success, false)
})

test('orderItemsSchema accepts a valid single item', () => {
  const result = orderItemsSchema.safeParse([
    { productId: 'prod_1', quantity: 2 },
  ])

  assert.equal(result.success, true)
})

test('orderItemsSchema accepts items with distinct productId+variantId combinations', () => {
  const result = orderItemsSchema.safeParse([
    { productId: 'prod_1', variantId: 'var_1', quantity: 1 },
    { productId: 'prod_1', variantId: 'var_2', quantity: 1 },
  ])

  assert.equal(result.success, true)
})

test('orderItemsSchema rejects duplicate productId without variant', () => {
  const result = orderItemsSchema.safeParse([
    { productId: 'prod_1', quantity: 1 },
    { productId: 'prod_1', quantity: 2 },
  ])

  assert.equal(result.success, false)
})

test('orderItemsSchema rejects duplicate productId+variantId combination', () => {
  const result = orderItemsSchema.safeParse([
    { productId: 'prod_1', variantId: 'var_1', quantity: 1 },
    { productId: 'prod_1', variantId: 'var_1', quantity: 3 },
  ])

  assert.equal(result.success, false)
})

test('orderItemsSchema rejects items with non-positive quantity', () => {
  const result = orderItemsSchema.safeParse([
    { productId: 'prod_1', quantity: 0 },
  ])

  assert.equal(result.success, false)
})

// ─── toPublicMarketplaceSettings ──────────────────────────────────────────

test('toPublicMarketplaceSettings strips the commission rate and exposes only public fields', () => {
  const settings = {
    DEFAULT_COMMISSION_RATE: 0.12,
    FREE_SHIPPING_THRESHOLD: 35,
    FLAT_SHIPPING_COST: 4.95,
    MAINTENANCE_MODE: false,
    HERO_BANNER_TEXT: 'Bienvenidos',
  }

  const pub = toPublicMarketplaceSettings(settings)

  assert.equal('DEFAULT_COMMISSION_RATE' in pub, false)
  assert.equal(pub.FREE_SHIPPING_THRESHOLD, 35)
  assert.equal(pub.FLAT_SHIPPING_COST, 4.95)
  assert.equal(pub.MAINTENANCE_MODE, false)
  assert.equal(pub.HERO_BANNER_TEXT, 'Bienvenidos')
})

// ─── calculateShippingCost ────────────────────────────────────────────────

test('calculateShippingCost returns 0 when subtotal meets or exceeds the free threshold', () => {
  const settings = { FREE_SHIPPING_THRESHOLD: 35, FLAT_SHIPPING_COST: 4.95 }

  assert.equal(calculateShippingCost(35, settings), 0)
  assert.equal(calculateShippingCost(50, settings), 0)
})

test('calculateShippingCost returns flat cost when subtotal is below the threshold', () => {
  const settings = { FREE_SHIPPING_THRESHOLD: 35, FLAT_SHIPPING_COST: 4.95 }

  assert.equal(calculateShippingCost(34.99, settings), 4.95)
  assert.equal(calculateShippingCost(0, settings), 4.95)
})

// ─── resolveMarketplaceSettings with string-typed values ──────────────────

test('resolveMarketplaceSettings coerces string numbers to floats', () => {
  const resolved = resolveMarketplaceSettings([
    { key: 'DEFAULT_COMMISSION_RATE', value: '0.15' },
    { key: 'FREE_SHIPPING_THRESHOLD', value: '49.5' },
  ])

  assert.equal(resolved.DEFAULT_COMMISSION_RATE, 0.15)
  assert.equal(resolved.FREE_SHIPPING_THRESHOLD, 49.5)
})

test('resolveMarketplaceSettings coerces string booleans', () => {
  const resolved = resolveMarketplaceSettings([
    { key: 'MAINTENANCE_MODE', value: 'true' },
  ])

  assert.equal(resolved.MAINTENANCE_MODE, true)

  const resolved2 = resolveMarketplaceSettings([
    { key: 'MAINTENANCE_MODE', value: 'false' },
  ])

  assert.equal(resolved2.MAINTENANCE_MODE, false)
})

test('resolveMarketplaceSettings trims whitespace from text values', () => {
  const resolved = resolveMarketplaceSettings([
    { key: 'HERO_BANNER_TEXT', value: '  Flash sale  ' },
  ])

  assert.equal(resolved.HERO_BANNER_TEXT, 'Flash sale')
})

test('resolveMarketplaceSettings falls back to defaults for missing keys', () => {
  const resolved = resolveMarketplaceSettings([])

  assert.equal(resolved.DEFAULT_COMMISSION_RATE, MARKETPLACE_SETTINGS_DEFAULTS.DEFAULT_COMMISSION_RATE)
  assert.equal(resolved.FREE_SHIPPING_THRESHOLD, MARKETPLACE_SETTINGS_DEFAULTS.FREE_SHIPPING_THRESHOLD)
  assert.equal(resolved.FLAT_SHIPPING_COST, MARKETPLACE_SETTINGS_DEFAULTS.FLAT_SHIPPING_COST)
  assert.equal(resolved.MAINTENANCE_MODE, MARKETPLACE_SETTINGS_DEFAULTS.MAINTENANCE_MODE)
  assert.equal(resolved.HERO_BANNER_TEXT, MARKETPLACE_SETTINGS_DEFAULTS.HERO_BANNER_TEXT)
})

test('resolveMarketplaceSettings falls back to default for non-finite number values', () => {
  const resolved = resolveMarketplaceSettings([
    { key: 'DEFAULT_COMMISSION_RATE', value: 'not-a-number' },
    { key: 'FREE_SHIPPING_THRESHOLD', value: null },
  ])

  assert.equal(resolved.DEFAULT_COMMISSION_RATE, MARKETPLACE_SETTINGS_DEFAULTS.DEFAULT_COMMISSION_RATE)
  assert.equal(resolved.FREE_SHIPPING_THRESHOLD, MARKETPLACE_SETTINGS_DEFAULTS.FREE_SHIPPING_THRESHOLD)
})
