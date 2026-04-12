/**
 * Stock Availability Tests (#80)
 * Verifies single source of truth for inventory
 */

import { describe, it, expect, beforeAll, afterAll } from './test-helpers'
import { db } from '@/lib/db'
import {
  getEffectiveStockForProduct,
  canPurchaseQuantity,
  getStockDisplayText,
} from '@/domains/catalog/stock'

describe('Stock Availability - Single Source of Truth (#80)', () => {
  let vendorId: string
  let vendorUserId: string
  let productId: string
  let variantId1: string
  let variantId2: string

  beforeAll(async () => {
    const vendorUser = await db.user.create({
      data: {
        email: `stock-vendor-${Date.now()}@test.local`,
        firstName: 'Stock',
        lastName: 'Vendor',
        passwordHash: 'hashed',
        role: 'VENDOR',
        emailVerified: new Date(),
      },
    })
    vendorUserId = vendorUser.id

    // Create vendor
    const vendor = await db.vendor.create({
      data: {
        userId: vendorUser.id,
        displayName: 'Test Vendor',
        slug: `vendor-${Date.now()}`,
        status: 'ACTIVE',
        stripeOnboarded: true,
        stripeAccountId: `acct_test_${Date.now()}`,
      },
    })
    vendorId = vendor.id

    // Create product WITHOUT variants initially
    const product = await db.product.create({
      data: {
        name: 'Test Product',
        slug: `product-${Date.now()}`,
        images: [],
        basePrice: 50,
        taxRate: 0.21,
        unit: 'pcs',
        stock: 100, // Base product stock
        trackStock: true,
        certifications: [],
        tags: [],
        vendorId,
        status: 'ACTIVE',
      },
    })
    productId = product.id

    // Add variants
    const var1 = await db.productVariant.create({
      data: {
        productId,
        sku: `stock-red-${Date.now()}`,
        name: 'Red',
        stock: 30,
        isActive: true,
      },
    })
    variantId1 = var1.id

    const var2 = await db.productVariant.create({
      data: {
        productId,
        sku: `stock-blue-${Date.now()}`,
        name: 'Blue',
        stock: 20,
        isActive: true,
      },
    })
    variantId2 = var2.id
  })

  afterAll(async () => {
    await db.productVariant.deleteMany({ where: { productId } })
    await db.product.delete({ where: { id: productId } })
    await db.vendor.delete({ where: { id: vendorId } })
    await db.user.delete({ where: { id: vendorUserId } })
  })

  describe('getEffectiveStockForProduct', () => {
    it('should return product stock when no variants exist', async () => {
      // Create product without variants
      const noVariantProduct = await db.product.create({
        data: {
          name: 'No Variants',
          slug: `no-var-${Date.now()}`,
          images: [],
          basePrice: 25,
          taxRate: 0.21,
          unit: 'kg',
          stock: 75,
          trackStock: true,
          certifications: [],
          tags: [],
          vendorId,
          status: 'ACTIVE',
        },
      })

      const stock = getEffectiveStockForProduct(
        { ...noVariantProduct, variants: [] },
        undefined
      )

      expect(stock.available).toBe(75)
      expect(stock.limitTracked).toBe(true)

      await db.product.delete({ where: { id: noVariantProduct.id } })
    })

    it('should sum variant stock when variants exist', async () => {
      const product = await db.product.findUnique({
        where: { id: productId },
        include: { variants: { where: { isActive: true } } },
      })

      const stock = getEffectiveStockForProduct(product!)

      // Should be 30 + 20 = 50 (not the base product stock of 100)
      expect(stock.available).toBe(50)
      expect(stock.limitTracked).toBe(true)
    })

    it('should respect variant-specific stock check', async () => {
      const product = await db.product.findUnique({
        where: { id: productId },
        include: { variants: { where: { isActive: true } } },
      })

      const variant1Stock = getEffectiveStockForProduct(product!, variantId1)
      expect(variant1Stock.available).toBe(30)

      const variant2Stock = getEffectiveStockForProduct(product!, variantId2)
      expect(variant2Stock.available).toBe(20)
    })

    it('should return unavailable for an unknown variant id', async () => {
      const product = await db.product.findUnique({
        where: { id: productId },
        include: { variants: { where: { isActive: true } } },
      })

      const stock = getEffectiveStockForProduct(product!, 'missing-variant')
      expect(stock.available).toBe(0)
      expect(stock.limitTracked).toBe(false)
    })

    it('should ignore inactive variants', async () => {
      // Deactivate a variant
      await db.productVariant.update({
        where: { id: variantId2 },
        data: { isActive: false },
      })

      const product = await db.product.findUnique({
        where: { id: productId },
        include: { variants: { where: { isActive: true } } },
      })

      const stock = getEffectiveStockForProduct(product!)
      expect(stock.available).toBe(30) // Only variant1

      // Reactivate
      await db.productVariant.update({
        where: { id: variantId2 },
        data: { isActive: true },
      })
    })

    it('should respect trackStock flag', async () => {
      const noTrackProduct = await db.product.create({
        data: {
          name: 'No Stock Tracking',
          slug: `no-track-${Date.now()}`,
          images: [],
          basePrice: 10,
          taxRate: 0.21,
          unit: 'service',
          stock: 0,
          trackStock: false, // Not tracking
          certifications: [],
          tags: [],
          vendorId,
          status: 'ACTIVE',
        },
      })

      const stock = getEffectiveStockForProduct(
        { ...noTrackProduct, variants: [] },
        undefined
      )

      expect(stock.limitTracked).toBe(false)
      expect(stock.available).toBe(0) // But for checking context

      await db.product.delete({ where: { id: noTrackProduct.id } })
    })
  })

  describe('canPurchaseQuantity', () => {
    it('should allow purchase if quantity <= stock', () => {
      const stock = { available: 50, limitTracked: true }
      expect(canPurchaseQuantity(stock, 30)).toBe(true)
      expect(canPurchaseQuantity(stock, 50)).toBe(true)
    })

    it('should prevent purchase if quantity > stock', () => {
      const stock = { available: 50, limitTracked: true }
      expect(canPurchaseQuantity(stock, 51)).toBe(false)
      expect(canPurchaseQuantity(stock, 100)).toBe(false)
    })

    it('should allow unlimited purchases when not tracking', () => {
      const unlimitedStock = { available: 0, limitTracked: false }
      expect(canPurchaseQuantity(unlimitedStock, 1000)).toBe(true)
    })

    it('should allow unlimited purchases when stock is null', () => {
      const nullStock = { available: null, limitTracked: false }
      expect(canPurchaseQuantity(nullStock, 1000)).toBe(true)
    })
  })

  describe('getStockDisplayText', () => {
    it('should show "Sin stock" when empty', () => {
      const stock = { available: 0, limitTracked: true }
      expect(getStockDisplayText(stock)).toBe('Sin stock')
    })

    it('should show "Quedan N" when <= 5 units', () => {
      const stock = { available: 3, limitTracked: true }
      expect(getStockDisplayText(stock)).toContain('Quedan 3')
    })

    it('should show "N disponibles" when > 5 units', () => {
      const stock = { available: 100, limitTracked: true }
      expect(getStockDisplayText(stock)).toBe('100 disponibles')
    })

    it('should show "En stock" when not tracking', () => {
      const stock = { available: 0, limitTracked: false }
      expect(getStockDisplayText(stock)).toBe('En stock')
    })

    it('should show "En stock" for unlimited stock when tracking is disabled', () => {
      const stock = { available: null, limitTracked: false }
      expect(getStockDisplayText(stock)).toBe('En stock')
    })
  })

  describe('Double source of truth prevention', () => {
    it('should never use Product.stock when variants exist', async () => {
      const product = await db.product.findUnique({
        where: { id: productId },
        include: { variants: { where: { isActive: true } } },
      })

      const stock = getEffectiveStockForProduct(product!)

      // If this fails, it means code is using Product.stock instead of variant sum
      expect(stock.available).not.toBe(product!.stock)
      expect(stock.available).toBe(50) // Sum of variants, not 100
    })

    it('should prefer variant stock over product stock for clarity', async () => {
      // Update product stock to different value than variants
      await db.product.update({
        where: { id: productId },
        data: { stock: 999 }, // Phantom stock
      })

      const product = await db.product.findUnique({
        where: { id: productId },
        include: { variants: { where: { isActive: true } } },
      })

      const stock = getEffectiveStockForProduct(product!)

      // Must use variant sum (50), NOT product stock (999)
      expect(stock.available).toBe(50)

      // Restore
      await db.product.update({
        where: { id: productId },
        data: { stock: 100 },
      })
    })
  })
})
