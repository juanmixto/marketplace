import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { respondToReview, deleteReviewResponse } from '@/domains/reviews/actions'
import { updateProductVariants } from '@/domains/vendors/actions'
import { db } from '@/lib/db'
import {
  buildSession,
  clearTestSession,
  createActiveProduct,
  createUser,
  createVendorUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

/**
 * Cross-tenant authorization audit for review and variant actions (#310).
 *
 * Complements vendor-cross-vendor-isolation.test.ts, which covers
 * updateProduct/deleteProduct/setProductStock/*Promotion/advanceFulfillment.
 * The three cases below were not yet covered; every sensitive
 * mutation deserves at least one negative test to lock in the
 * ownership invariant.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
  Object.assign(process.env, { NODE_ENV: 'test' })
})

afterEach(() => {
  clearTestSession()
})

async function seedReviewableOrder(customerId: string, vendorId: string, productId: string) {
  const order = await db.order.create({
    data: {
      orderNumber: `REV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId,
      status: 'DELIVERED',
      paymentStatus: 'SUCCEEDED',
      subtotal: 12,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 12,
      fulfillments: { create: { vendorId, status: 'DELIVERED' } },
    },
  })
  return order
}

test('respondToReview rejects vendor B responding to a review on vendor A product', async () => {
  const a = await createVendorUser()
  const b = await createVendorUser()
  const productA = await createActiveProduct(a.vendor.id)
  const buyer = await createUser('CUSTOMER')
  const order = await seedReviewableOrder(buyer.id, a.vendor.id, productA.id)

  const review = await db.review.create({
    data: {
      orderId: order.id,
      productId: productA.id,
      vendorId: a.vendor.id,
      customerId: buyer.id,
      rating: 5,
      body: 'buen producto',
    },
  })

  useTestSession(buildSession(b.user.id, 'VENDOR'))
  await assert.rejects(
    () => respondToReview({ reviewId: review.id, response: 'hijack' }),
    /No puedes responder/,
  )

  const fresh = await db.review.findUnique({ where: { id: review.id } })
  assert.equal(fresh?.vendorResponse, null, 'review untouched')
})

test('deleteReviewResponse rejects vendor B trying to wipe vendor A response', async () => {
  const a = await createVendorUser()
  const b = await createVendorUser()
  const productA = await createActiveProduct(a.vendor.id)
  const buyer = await createUser('CUSTOMER')
  const order = await seedReviewableOrder(buyer.id, a.vendor.id, productA.id)

  const review = await db.review.create({
    data: {
      orderId: order.id,
      productId: productA.id,
      vendorId: a.vendor.id,
      customerId: buyer.id,
      rating: 4,
      body: 'razonable',
      vendorResponse: 'Gracias por tu opinión',
      vendorResponseAt: new Date(),
    },
  })

  useTestSession(buildSession(b.user.id, 'VENDOR'))
  await assert.rejects(
    () => deleteReviewResponse(review.id),
    /No puedes modificar/,
  )

  const fresh = await db.review.findUnique({ where: { id: review.id } })
  assert.equal(
    fresh?.vendorResponse,
    'Gracias por tu opinión',
    'response untouched',
  )
})

test('updateProductVariants rejects vendor B trying to mutate variants of vendor A product', async () => {
  const a = await createVendorUser()
  const b = await createVendorUser()
  const productA = await createActiveProduct(a.vendor.id)

  useTestSession(buildSession(b.user.id, 'VENDOR'))
  await assert.rejects(
    () =>
      updateProductVariants({
        productId: productA.id,
        variants: [
          {
            id: null,
            name: 'Injected',
            priceModifier: 0,
            stock: 1,
            isActive: true,
          },
        ],
      }),
    /Producto no encontrado/,
  )

  const variants = await db.productVariant.findMany({
    where: { productId: productA.id },
  })
  assert.equal(variants.length, 0, 'no variant injected')
})
