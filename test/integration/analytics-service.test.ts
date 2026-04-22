import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { getAnalytics } from '@/domains/analytics/service'
import { resetIntegrationDatabase } from './helpers'
import { createActiveProduct, createUser, createVendorUser } from './helpers'

beforeEach(async () => {
  await resetIntegrationDatabase()
})

async function seedOrder({
  orderNumber,
  customerId,
  productId,
  vendorId,
  placedAt,
}: {
  orderNumber: string
  customerId: string
  productId: string
  vendorId: string
  placedAt: Date
}) {
  const product = await db.product.findUniqueOrThrow({ where: { id: productId } })
  const order = await db.order.create({
    data: {
      orderNumber,
      customerId,
      status: 'PLACED',
      paymentStatus: 'SUCCEEDED',
      subtotal: 10,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 10,
      placedAt,
      shippingAddressSnapshot: {
        firstName: 'Buyer',
        lastName: 'Test',
        line1: 'Calle Falsa 123',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
      },
    },
  })
  await db.orderLine.create({
    data: {
      orderId: order.id,
      productId,
      vendorId,
      quantity: 1,
      unitPrice: 10,
      taxRate: 0,
      productSnapshot: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        unit: product.unit,
      },
    },
  })
}

test('analytics service computes activation lag and first-order KPIs', async () => {
  const buyerA = await createUser('CUSTOMER')
  const buyerB = await createUser('CUSTOMER')
  const vendorUser = await createVendorUser()
  const product = await createActiveProduct(vendorUser.vendor.id, { stock: 5 })

  await db.user.update({
    where: { id: buyerA.id },
    data: { createdAt: new Date('2026-03-20T00:00:00Z') },
  })
  await db.user.update({
    where: { id: buyerB.id },
    data: { createdAt: new Date('2026-03-25T00:00:00Z') },
  })
  await db.user.update({
    where: { id: vendorUser.user.id },
    data: { createdAt: new Date('2026-03-10T00:00:00Z') },
  })
  await db.product.update({
    where: { id: product.id },
    data: { createdAt: new Date('2026-04-03T00:00:00Z') },
  })

  await seedOrder({
    orderNumber: 'ORD-1',
    customerId: buyerA.id,
    productId: product.id,
    vendorId: vendorUser.vendor.id,
    placedAt: new Date('2026-04-01T10:00:00Z'),
  })
  await seedOrder({
    orderNumber: 'ORD-2',
    customerId: buyerA.id,
    productId: product.id,
    vendorId: vendorUser.vendor.id,
    placedAt: new Date('2026-04-10T10:00:00Z'),
  })
  await seedOrder({
    orderNumber: 'ORD-3',
    customerId: buyerB.id,
    productId: product.id,
    vendorId: vendorUser.vendor.id,
    placedAt: new Date('2026-04-02T10:00:00Z'),
  })

  const data = await getAnalytics({
    preset: 'custom',
    from: new Date('2026-04-01T00:00:00Z'),
    to: new Date('2026-04-30T23:59:59.999Z'),
  })

  assert.equal(data.kpis.orders.current, 3)
  assert.equal(data.kpis.repeatRatePct.current, 50)
  assert.equal(data.kpis.firstOrders.current, 2)
  assert.equal(data.kpis.buyerActivationLagDays.current, 10.4)
  assert.equal(data.kpis.firstProducts.current, 1)
  assert.equal(data.kpis.vendorActivationLagDays.current, 24)
})
