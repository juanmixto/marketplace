import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getAvailableStockForPurchase,
  getSelectedVariant,
  getVariantAdjustedCompareAtPrice,
  getVariantAdjustedPrice,
  productRequiresVariantSelection,
} from '@/domains/catalog/variants'

const productWithVariants = {
  basePrice: 12,
  compareAtPrice: 15,
  stock: 20,
  trackStock: true,
  variants: [
    { id: 'small', name: 'Caja pequena', priceModifier: 0, stock: 6, isActive: true },
    { id: 'large', name: 'Caja grande', priceModifier: 3.5, stock: 2, isActive: true },
  ],
}

test('productRequiresVariantSelection detects active variants', () => {
  assert.equal(productRequiresVariantSelection(productWithVariants), true)
  assert.equal(productRequiresVariantSelection({ ...productWithVariants, variants: [] }), false)
})

test('getSelectedVariant only resolves active variants from the same product', () => {
  assert.equal(getSelectedVariant(productWithVariants, 'large')?.name, 'Caja grande')
  assert.equal(getSelectedVariant(productWithVariants, 'missing'), null)
})

test('variant pricing adjusts both current and compare-at prices', () => {
  const variant = getSelectedVariant(productWithVariants, 'large')
  assert.equal(getVariantAdjustedPrice(productWithVariants.basePrice, variant), 15.5)
  assert.equal(getVariantAdjustedCompareAtPrice(productWithVariants.compareAtPrice, variant), 18.5)
})

test('variant stock becomes the source of truth when the product defines variants', () => {
  const variant = getSelectedVariant(productWithVariants, 'small')
  assert.equal(getAvailableStockForPurchase(productWithVariants, variant), 6)
  assert.equal(getAvailableStockForPurchase({ ...productWithVariants, variants: [] }), 20)
  assert.equal(getAvailableStockForPurchase({ ...productWithVariants, trackStock: false }, variant), null)
})
