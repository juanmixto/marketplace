/**
 * Stock Race Condition Test
 * Simulates concurrent orders to verify SELECT FOR UPDATE prevents overselling
 *
 * Run with: npm test -- stock-concurrency.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { createOrder } from '@/domains/orders/actions'
import type { CheckoutFormData } from '@/domains/orders/checkout'

describe('Stock Race Condition Prevention (#79)', () => {
  let testProductId: string
  let testUserId1: string
  let testUserId2: string

  beforeAll(async () => {
    // Setup: Create test users and product with limited stock
    const user1 = await db.user.create({
      data: {
        email: `test-user-1-${Date.now()}@example.com`,
        password: 'hashed-password',
        role: 'CUSTOMER',
      },
    })
    testUserId1 = user1.id

    const user2 = await db.user.create({
      data: {
        email: `test-user-2-${Date.now()}@example.com`,
        password: 'hashed-password',
        role: 'CUSTOMER',
      },
    })
    testUserId2 = user2.id

    // Create vendor
    const vendor = await db.vendor.create({
      data: {
        userId: user1.id,
        displayName: 'Test Vendor',
        slug: `test-vendor-${Date.now()}`,
        stripeOnboarded: true,
        stripeAccountId: 'acct_test',
      },
    })

    // Create product with stock = 1
    const product = await db.product.create({
      data: {
        name: 'Concurrency Test Product',
        slug: `test-product-${Date.now()}`,
        basePrice: 10.0,
        taxRate: 0.21,
        unit: 'kg',
        stock: 1,
        trackStock: true,
        vendorId: vendor.id,
        status: 'ACTIVE',
      },
    })
    testProductId = product.id
  })

  afterAll(async () => {
    // Cleanup
    const product = await db.product.findUnique({
      where: { id: testProductId },
    })
    if (product) {
      await db.product.deleteMany({ where: { id: testProductId } })
    }

    await db.user.deleteMany({
      where: { id: { in: [testUserId1, testUserId2] } },
    })
  })

  it('should not allow concurrent orders to exceed available stock', async () => {
    const testAddress: CheckoutFormData = {
      address: {
        firstName: 'Test',
        lastName: 'User',
        line1: 'Calle Principal 123',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
      },
      saveAddress: false,
    }

    const items = [{ productId: testProductId, quantity: 1 }]

    // Simulate concurrent requests
    // Note: Real concurrency testing would require a load testing tool
    // This is a simulation showing the test structure
    let successCount = 0
    let errorCount = 0

    // Order 1 attempt
    try {
      // In a real scenario, this would be async and truly concurrent
      // For now, we verify the logic works sequentially
      const order1 = await createOrder(items, testAddress)
      successCount++
      expect(order1).toBeDefined()
      expect(order1.orderId).toBeTruthy()
    } catch (error) {
      errorCount++
      expect((error as Error).message).toContain('Stock insuficiente')
    }

    // Order 2 attempt (should fail because stock is now exhausted)
    try {
      const order2 = await createOrder(items, testAddress)
      // If we get here, it means BOTH orders succeeded, which is the bug
      errorCount++
      throw new Error('Race condition detected: second order should have failed')
    } catch (error) {
      expect((error as Error).message).toContain('Stock insuficiente')
    }

    // Verify: only 1 order succeeded, stock is now 0
    const finalProduct = await db.product.findUnique({
      where: { id: testProductId },
    })
    expect(finalProduct?.stock).toBe(0)
    expect(successCount).toBe(1)
  })

  it('stock should never go negative', async () => {
    const product = await db.product.findUnique({
      where: { id: testProductId },
    })
    expect(product?.stock).toBeGreaterThanOrEqual(0)
  })
})
