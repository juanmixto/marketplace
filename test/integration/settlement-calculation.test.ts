/**
 * Settlement Calculation and Approval Tests (#88)
 */

import { describe, it, expect, beforeAll, afterAll } from '../test-helpers'
import { db } from '@/lib/db'
import { calculateSettlement, upsertSettlement, generateSettlementsForPeriod } from '@/domains/settlements/calculate'

describe('Settlement Calculation (#88)', () => {
  let vendorId: string
  let userId: string
  let customerId: string
  let productId: string
  let orderId: string

  beforeAll(async () => {
    // Create user and vendor
    const user = await db.user.create({
      data: {
        email: `vendor-${Date.now()}@test.local`,
        firstName: 'Test',
        lastName: 'Vendor',
        passwordHash: 'test',
        role: 'VENDOR',
        emailVerified: new Date(),
      },
    })
    userId = user.id

    const vendor = await db.vendor.create({
      data: {
        userId: user.id,
        displayName: 'Test Vendor',
        slug: `vendor-${Date.now()}`,
        status: 'ACTIVE',
        stripeOnboarded: true,
        stripeAccountId: `acct_test_${Date.now()}`,
      },
    })
    vendorId = vendor.id

    // Create customer
    const customer = await db.user.create({
      data: {
        email: `customer-${Date.now()}@test.local`,
        firstName: 'Customer',
        lastName: 'Test',
        passwordHash: 'test',
        role: 'CUSTOMER',
        emailVerified: new Date(),
      },
    })
    customerId = customer.id

    // Create product
    const product = await db.product.create({
      data: {
        name: 'Test Product',
        slug: `product-${Date.now()}`,
        images: [],
        basePrice: 100,
        taxRate: 0.21,
        unit: 'pcs',
        stock: 100,
        trackStock: true,
        certifications: [],
        tags: [],
        vendorId,
        status: 'ACTIVE',
      },
    })
    productId = product.id

    // Create order
    const address = await db.address.create({
      data: {
        userId: customerId,
        firstName: 'John',
        lastName: 'Doe',
        line1: '123 Main St',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
      },
    })

    const order = await db.order.create({
      data: {
        orderNumber: `ORD-${Date.now()}`,
        customerId,
        addressId: address.id,
        subtotal: 100,
        shippingCost: 5,
        taxAmount: 21,
        grandTotal: 126,
        status: 'DELIVERED',
        paymentStatus: 'SUCCEEDED',
        lines: {
          create: {
            productId,
            vendorId,
            quantity: 1,
            unitPrice: 100,
            taxRate: 0.21,
            productSnapshot: {
              id: productId,
              name: 'Test Product',
              slug: 'test-product',
              images: [],
              unit: 'pcs',
              vendorName: 'Test Vendor',
              variantName: null,
            },
          },
        },
        payments: {
          create: {
            provider: 'mock',
            providerRef: `mock_pi_${Date.now()}`,
            amount: 126,
            currency: 'EUR',
            status: 'SUCCEEDED',
          },
        },
        fulfillments: {
          create: {
            vendorId,
            status: 'SHIPPED',
            shippedAt: new Date(),
          },
        },
      },
    })
    orderId = order.id
  })

  afterAll(async () => {
    await db.settlement.deleteMany({ where: { vendorId } })
    await db.vendorFulfillment.deleteMany({ where: { orderId } })
    await db.payment.deleteMany({ where: { orderId } })
    await db.orderLine.deleteMany({ where: { orderId } })
    await db.order.deleteMany({ where: { id: orderId } })
    await db.product.delete({ where: { id: productId } })
    await db.vendor.delete({ where: { id: vendorId } })
    await db.address.deleteMany({ where: { userId: customerId } })
    await db.user.delete({ where: { id: userId } })
    await db.user.delete({ where: { id: customerId } })
  })

  describe('calculateSettlement', () => {
    it('should calculate settlement for delivered orders', async () => {
      const periodFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 1 week ago
      const periodTo = new Date()

      const settlement = await calculateSettlement(vendorId, periodFrom, periodTo)

      expect(settlement.vendorId).toBe(vendorId)
      expect(settlement.grossSales).toBeGreaterThan(0)
      expect(settlement.commissions).toBeGreaterThan(0)
      expect(settlement.netPayable).toBeGreaterThan(0)
      expect(settlement.netPayable).toBeLessThan(settlement.grossSales)
    })

    it('should handle period with no sales', async () => {
      // Future period with no orders
      const periodFrom = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      const periodTo = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)

      const settlement = await calculateSettlement(vendorId, periodFrom, periodTo)

      expect(settlement.grossSales).toBe(0)
      expect(settlement.commissions).toBe(0)
      expect(settlement.netPayable).toBe(0)
    })

    it('should deduct commissions from gross sales', async () => {
      const periodFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const periodTo = new Date()

      const settlement = await calculateSettlement(vendorId, periodFrom, periodTo)

      const expectedCommission = settlement.grossSales * 0.12 // Default 12% commission
      expect(Math.abs(Number(settlement.commissions) - Number(expectedCommission))).toBeLessThan(0.01)
    })
  })

  describe('Settlement status flow', () => {
    it('should create settlement in DRAFT status', async () => {
      const periodFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const periodTo = new Date()

      const calculation = await calculateSettlement(vendorId, periodFrom, periodTo)
      const settlement = await upsertSettlement(calculation)

      expect(settlement.status).toBe('DRAFT')
      expect(settlement.paidAt).toBeNull()
    })

    it('should handle duplicate period settlement (upsert)', async () => {
      const periodFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const periodTo = new Date()

      const calc1 = await calculateSettlement(vendorId, periodFrom, periodTo)
      const settlement1 = await upsertSettlement(calc1)

      // Modify and upsert again
      calc1.adjustments = 50
      const settlement2 = await upsertSettlement(calc1)

      expect(settlement1.id).toBe(settlement2.id)
      expect(Number(settlement2.adjustments)).toBeGreaterThan(0)
    })
  })

  describe('Bulk generation', () => {
    it('should generate settlements for active vendors', async () => {
      const periodFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const periodTo = new Date()

      const results = await generateSettlementsForPeriod(periodFrom, periodTo)

      expect(results.length).toBeGreaterThan(0)
      expect(results.some(r => r.vendorId === vendorId)).toBe(true)
    })
  })

  describe('Commission calculation', () => {
    it('should apply correct commission rate', async () => {
      const periodFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const periodTo = new Date()

      const settlement = await calculateSettlement(vendorId, periodFrom, periodTo)

      // Verify commission is reasonable (5-30% typical)
      const commissionRate = Number(settlement.commissions) / Number(settlement.grossSales)
      expect(commissionRate).toBeGreaterThanOrEqual(0.05)
      expect(commissionRate).toBeLessThanOrEqual(0.30)
    })

    it('should calculate net payable correctly', async () => {
      const periodFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const periodTo = new Date()

      const settlement = await calculateSettlement(vendorId, periodFrom, periodTo)

      const expected =
        Number(settlement.grossSales) -
        Number(settlement.commissions) -
        Number(settlement.refunds) +
        Number(settlement.adjustments)

      expect(Math.abs(Number(settlement.netPayable) - expected)).toBeLessThan(0.01)
    })
  })
})
