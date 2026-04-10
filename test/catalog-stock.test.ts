import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canPurchaseQuantity,
  getEffectiveStockForProduct,
  getStockDisplayText,
} from '@/domains/catalog/stock'
import type { Product, ProductVariant } from '@/generated/prisma/client'

function makeProduct(overrides: Partial<Product> = {}): Product & { variants?: ProductVariant[] } {
  return {
    id: 'prod_1',
    name: 'Test Product',
    slug: 'test-product',
    description: '',
    stock: 10,
    trackStock: true,
    isActive: true,
    vendorId: 'vendor_1',
    categoryId: null,
    price: 9.99,
    compareAtPrice: null,
    taxRate: 0.1,
    unit: 'unit',
    images: [],
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Product
}

function makeVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: 'var_1',
    productId: 'prod_1',
    name: 'Default',
    sku: null,
    stock: 5,
    price: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as ProductVariant
}

// ─── getEffectiveStockForProduct ───────────────────────────────────────────

test('getEffectiveStockForProduct uses product stock when no variants', () => {
  const product = makeProduct({ stock: 20, trackStock: true })
  const info = getEffectiveStockForProduct(product)

  assert.equal(info.available, 20)
  assert.equal(info.limitTracked, true)
})

test('getEffectiveStockForProduct uses product stock when variants array is empty', () => {
  const product = { ...makeProduct({ stock: 7, trackStock: true }), variants: [] }
  const info = getEffectiveStockForProduct(product)

  assert.equal(info.available, 7)
  assert.equal(info.limitTracked, true)
})

test('getEffectiveStockForProduct uses product stock when all variants are inactive', () => {
  const product = {
    ...makeProduct({ stock: 3, trackStock: true }),
    variants: [makeVariant({ isActive: false, stock: 99 })],
  }
  const info = getEffectiveStockForProduct(product)

  assert.equal(info.available, 3)
  assert.equal(info.limitTracked, true)
})

test('getEffectiveStockForProduct returns trackStock=false when product has no stock tracking', () => {
  const product = makeProduct({ stock: null, trackStock: false })
  const info = getEffectiveStockForProduct(product)

  assert.equal(info.available, null)
  assert.equal(info.limitTracked, false)
})

test('getEffectiveStockForProduct sums all active variant stock when no variantId given', () => {
  const product = {
    ...makeProduct(),
    variants: [
      makeVariant({ id: 'var_1', stock: 4, isActive: true }),
      makeVariant({ id: 'var_2', stock: 6, isActive: true }),
      makeVariant({ id: 'var_3', stock: 10, isActive: false }),
    ],
  }
  const info = getEffectiveStockForProduct(product)

  assert.equal(info.available, 10)
  assert.equal(info.limitTracked, true)
})

test('getEffectiveStockForProduct returns specific variant stock when variantId provided', () => {
  const product = {
    ...makeProduct(),
    variants: [
      makeVariant({ id: 'var_1', stock: 4, isActive: true }),
      makeVariant({ id: 'var_2', stock: 9, isActive: true }),
    ],
  }
  const info = getEffectiveStockForProduct(product, 'var_2')

  assert.equal(info.available, 9)
  assert.equal(info.limitTracked, true)
})

test('getEffectiveStockForProduct returns zero stock for unknown variantId', () => {
  const product = {
    ...makeProduct(),
    variants: [makeVariant({ id: 'var_1', stock: 4, isActive: true })],
  }
  const info = getEffectiveStockForProduct(product, 'var_unknown')

  assert.equal(info.available, 0)
  assert.equal(info.limitTracked, false)
})

test('getEffectiveStockForProduct treats null variant stock as unlimited in sum', () => {
  const product = {
    ...makeProduct(),
    variants: [
      makeVariant({ id: 'var_1', stock: null, isActive: true }),
      makeVariant({ id: 'var_2', stock: 3, isActive: true }),
    ],
  }
  const info = getEffectiveStockForProduct(product)

  // null variant stock counts as 0 in the sum
  assert.equal(info.available, 3)
  assert.equal(info.limitTracked, true)
})

test('getEffectiveStockForProduct returns null for a specific variant with null stock', () => {
  const product = {
    ...makeProduct(),
    variants: [makeVariant({ id: 'var_1', stock: null, isActive: true })],
  }
  const info = getEffectiveStockForProduct(product, 'var_1')

  assert.equal(info.available, null)
  assert.equal(info.limitTracked, false)
})

// ─── canPurchaseQuantity ───────────────────────────────────────────────────

test('canPurchaseQuantity allows when limit is not tracked', () => {
  assert.equal(canPurchaseQuantity({ available: 0, limitTracked: false }, 100), true)
})

test('canPurchaseQuantity allows when stock is null (unlimited)', () => {
  assert.equal(canPurchaseQuantity({ available: null, limitTracked: true }, 999), true)
})

test('canPurchaseQuantity allows when quantity is within available stock', () => {
  assert.equal(canPurchaseQuantity({ available: 10, limitTracked: true }, 10), true)
  assert.equal(canPurchaseQuantity({ available: 10, limitTracked: true }, 5), true)
})

test('canPurchaseQuantity rejects when quantity exceeds available stock', () => {
  assert.equal(canPurchaseQuantity({ available: 3, limitTracked: true }, 4), false)
  assert.equal(canPurchaseQuantity({ available: 0, limitTracked: true }, 1), false)
})

// ─── getStockDisplayText ───────────────────────────────────────────────────

test('getStockDisplayText shows "En stock" when limit is not tracked', () => {
  assert.equal(getStockDisplayText({ available: 0, limitTracked: false }), 'En stock')
})

test('getStockDisplayText shows "Disponible" for null (unlimited) stock', () => {
  assert.equal(getStockDisplayText({ available: null, limitTracked: true }), 'Disponible')
})

test('getStockDisplayText shows "Sin stock" when available is zero or negative', () => {
  assert.equal(getStockDisplayText({ available: 0, limitTracked: true }), 'Sin stock')
  assert.equal(getStockDisplayText({ available: -1, limitTracked: true }), 'Sin stock')
})

test('getStockDisplayText shows remaining count when stock is 1–5', () => {
  assert.equal(getStockDisplayText({ available: 1, limitTracked: true }), 'Quedan 1')
  assert.equal(getStockDisplayText({ available: 5, limitTracked: true }), 'Quedan 5')
})

test('getStockDisplayText shows available count when stock is above 5', () => {
  assert.equal(getStockDisplayText({ available: 6, limitTracked: true }), '6 disponibles')
  assert.equal(getStockDisplayText({ available: 100, limitTracked: true }), '100 disponibles')
})
