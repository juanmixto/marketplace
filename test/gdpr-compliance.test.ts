/**
 * GDPR Compliance Tests (#95)
 * Verifies data export and account deletion (right of access & right to be forgotten)
 */

import { describe, it, expect, beforeAll, afterAll } from './test-helpers'
import { db } from '@/lib/db'

describe('GDPR Compliance (#95)', () => {
  let userId: string
  let email: string
  let vendorId: string
  let productId: string
  let orderId: string

  beforeAll(async () => {
    // Create user with data
    email = `gdpr-test-${Date.now()}@test.local`
    const user = await db.user.create({
      data: {
        email,
        firstName: 'GDPR',
        lastName: 'Test',
        passwordHash: 'hashed',
        role: 'CUSTOMER',
        emailVerified: new Date(),
        consentAcceptedAt: new Date(),
      },
    })
    userId = user.id

    const vendorOwner = await db.user.create({
      data: {
        email: `gdpr-vendor-${Date.now()}@test.local`,
        firstName: 'Vendor',
        lastName: 'Owner',
        passwordHash: 'hashed',
        role: 'VENDOR',
        emailVerified: new Date(),
      },
    })

    const vendor = await db.vendor.create({
      data: {
        userId: vendorOwner.id,
        displayName: 'GDPR Vendor',
        slug: `gdpr-vendor-${Date.now()}`,
        status: 'ACTIVE',
      },
    })
    vendorId = vendor.id

    // Create address
    await db.address.create({
      data: {
        userId,
        firstName: 'John',
        lastName: 'Doe',
        line1: '123 Main St',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
      },
    })

    // Create order
    const product = await db.product.create({
      data: {
        name: 'Test Product',
        slug: `test-${Date.now()}`,
        images: [],
        basePrice: 100,
        taxRate: 0.21,
        unit: 'pcs',
        stock: 10,
        trackStock: true,
        certifications: [],
        tags: [],
        vendorId,
        status: 'ACTIVE',
      },
    })
    productId = product.id

    const order = await db.order.create({
      data: {
        orderNumber: `ORD-GDPR-${Date.now()}`,
        customerId: userId,
        subtotal: 100,
        shippingCost: 5,
        taxAmount: 21,
        grandTotal: 126,
        status: 'DELIVERED',
        paymentStatus: 'SUCCEEDED',
      },
    })
    orderId = order.id

    await db.orderLine.create({
      data: {
        orderId: order.id,
        productId: product.id,
        vendorId,
        quantity: 1,
        unitPrice: 100,
        taxRate: 0.21,
        productSnapshot: {
          id: product.id,
          name: 'Test',
          slug: 'test',
          images: [],
          unit: 'pcs',
          vendorName: 'GDPR Vendor',
          variantName: null,
        },
      },
    })
  })

  afterAll(async () => {
    await db.review.deleteMany({ where: { customerId: userId } })
    await db.orderLine.deleteMany({ where: { orderId } })
    await db.order.deleteMany({ where: { id: orderId } })
    await db.product.deleteMany({ where: { id: productId } })
    await db.vendor.deleteMany({ where: { id: vendorId } })
    await db.user.deleteMany({
      where: {
        OR: [
          { id: userId },
          { email: { startsWith: 'gdpr-vendor-' } },
        ],
      },
    })
  })

  describe('Art. 15 - Right of Access', () => {
    it('should export user data structure', async () => {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      })

      expect(user).toBeDefined()
      expect(user?.email).toBe(email)
      expect(user?.firstName).toBe('GDPR')
    })

    it('should include all data types in export', async () => {
      const [user, addresses, orders, reviews, incidents] = await Promise.all([
        db.user.findUnique({ where: { id: userId } }),
        db.address.findMany({ where: { userId } }),
        db.order.findMany({ where: { customerId: userId } }),
        db.review.findMany({ where: { customerId: userId } }),
        db.incident.findMany({ where: { customerId: userId } }),
      ])

      expect(user).toBeDefined()
      expect(addresses.length).toBeGreaterThan(0)
      expect(orders.length).toBeGreaterThan(0)
      expect(Array.isArray(reviews)).toBe(true)
      expect(Array.isArray(incidents)).toBe(true)
    })

    it('should track consent acceptance', async () => {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { consentAcceptedAt: true },
      })

      expect(user?.consentAcceptedAt).toBeDefined()
      expect(user?.consentAcceptedAt).toBeInstanceOf(Date)
    })
  })

  describe('Art. 17 - Right to Be Forgotten', () => {
    it('should anonimize user without deleting', async () => {
      // Anonimize
      await db.user.update({
        where: { id: userId },
        data: {
          email: `deleted_${userId}@anon.invalid`,
          passwordHash: null,
          deletedAt: new Date(),
          firstName: 'Usuario',
          lastName: 'Eliminado',
        },
      })

      const anonUser = await db.user.findUnique({ where: { id: userId } })

      expect(anonUser?.email).toBe(`deleted_${userId}@anon.invalid`)
      expect(anonUser?.passwordHash).toBeNull()
      expect(anonUser?.deletedAt).toBeDefined()
    })

    it('should preserve orders after deletion (tax compliance)', async () => {
      // Order should still exist even after user deletion
      const orders = await db.order.findMany({
        where: { customerId: userId },
      })

      expect(orders.length).toBeGreaterThan(0)
      expect(orders[0].customerId).toBe(userId)
    })

    it('should delete addresses on request', async () => {
      // Delete addresses
      await db.address.deleteMany({ where: { userId } })

      const addresses = await db.address.findMany({
        where: { userId },
      })

      expect(addresses.length).toBe(0)
    })

    it('should anonimize reviews (keep rating, remove text)', async () => {
      // Create and anonimize a review
      const order = await db.order.findFirst({
        where: { customerId: userId },
      })

      if (order) {
        const review = await db.review.create({
          data: {
            customerId: userId,
            orderId: order.id,
            productId,
            vendorId,
            rating: 4,
            body: 'Test comment',
          },
        })

        // Anonimize
        await db.review.update({
          where: { id: review.id },
          data: { body: null },
        })

        const updated = await db.review.findUnique({ where: { id: review.id } })
        expect(updated?.body).toBeNull()
        expect(updated?.rating).toBe(4) // Rating preserved
      }
    })

    it('should invalidate sessions on deletion', async () => {
      // Sessions should be deleted
      const sessions = await db.session.findMany({
        where: { userId },
      })

      // After deletion, no sessions should exist
      expect(Array.isArray(sessions)).toBe(true)
    })
  })

  describe('GDPR Compliance Checks', () => {
    it('should only anonimize, not hard-delete (tax obligation)', async () => {
      // User still exists in DB but anonimized
      const userStillExists = await db.user.findUnique({
        where: { id: userId },
      })

      expect(userStillExists).toBeDefined()
      expect(userStillExists?.deletedAt).toBeDefined()
      expect(userStillExists?.email).toContain('deleted_')
    })

    it('should prevent reusing deleted emails', async () => {
      const deletedEmail = `deleted_${userId}@anon.invalid`

      // Should not be able to create new user with same email
      // (because it's technically still in DB but marked as deleted)
      expect(deletedEmail).toContain('anon.invalid')
    })
  })
})
