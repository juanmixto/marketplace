import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  getAvailableStockForPurchase,
  getDefaultVariant,
  getSelectedVariant,
  getVariantAdjustedCompareAtPrice,
  getVariantAdjustedPrice,
  productRequiresVariantSelection,
  type PurchasableProduct,
} from '@/domains/catalog/variants'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

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

test('getDefaultVariant prefers the first active in-stock option for default selection', () => {
  assert.equal(getDefaultVariant(productWithVariants)?.id, 'small')
  assert.equal(
    getDefaultVariant({
      ...productWithVariants,
      variants: [
        { id: 'sold-out', name: 'Agotada', priceModifier: 0, stock: 0, isActive: true },
        { id: 'fallback', name: 'Disponible', priceModifier: 2, stock: 4, isActive: true },
      ],
    })?.id,
    'fallback'
  )
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

test('getAvailableStockForPurchase: product without variants uses Product.stock', () => {
  const product: PurchasableProduct = {
    basePrice: 10,
    stock: 42,
    trackStock: true,
    variants: [],
  }
  assert.equal(getAvailableStockForPurchase(product), 42)
})

test('getAvailableStockForPurchase: product with variants uses variant stock, ignores Product.stock', () => {
  const product: PurchasableProduct = {
    basePrice: 10,
    stock: 999, // this should be ignored
    trackStock: true,
    variants: [{ id: 'v1', name: 'Rojo', priceModifier: 0, stock: 3, isActive: true }],
  }
  const variant = getSelectedVariant(product, 'v1')
  assert.equal(getAvailableStockForPurchase(product, variant), 3)
})

test('getAvailableStockForPurchase: untracked product returns null regardless of stock value', () => {
  const product: PurchasableProduct = {
    basePrice: 10,
    stock: 50,
    trackStock: false,
    variants: [],
  }
  assert.equal(getAvailableStockForPurchase(product), null)
})

test('getAvailableStockForPurchase: variant selected but product has no active variants — falls back to Product.stock', () => {
  // Variant passed but no active variants in product (e.g. variant was deactivated)
  const product: PurchasableProduct = {
    basePrice: 10,
    stock: 5,
    trackStock: true,
    variants: [], // no active variants
  }
  assert.equal(getAvailableStockForPurchase(product, null), 5)
})

test('variant-aware product UI defaults to a concrete variant before adding to cart', () => {
  const purchasePanel = readSource('../src/components/catalog/ProductPurchasePanel.tsx')
  const productCard = readSource('../src/components/catalog/ProductCard.tsx')

  assert.match(purchasePanel, /const defaultVariant = getDefaultVariant\(product\)/)
  assert.match(purchasePanel, /useState<string>\(defaultVariant\?\.id \?\? ''\)/)
  assert.match(productCard, /variantId=\{defaultVariant\?\.id\}/)
  assert.match(productCard, /variantName=\{defaultVariant\?\.name\}/)
})
