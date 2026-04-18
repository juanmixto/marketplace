import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { getProducts } from '@/domains/catalog/queries'
import { db } from '@/lib/db'
import {
  createActiveProduct,
  createUser,
  createVendorUser,
  resetIntegrationDatabase,
} from './helpers'

/**
 * Catalog rating enrichment + top_rated sort (#324). Pins the
 * invariant that the listing query:
 *   1. Returns every ProductWithVendor with averageRating + totalReviews.
 *   2. top_rated orders by average desc, count desc, and fills the
 *      remaining slots with unrated products by recency so the page
 *      does not look empty on a young catalog.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
  Object.assign(process.env, { NODE_ENV: 'test' })
})

afterEach(() => {})

async function seedOrder(customerId: string, vendorId: string) {
  return db.order.create({
    data: {
      orderNumber: `T-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId,
      status: 'DELIVERED',
      paymentStatus: 'SUCCEEDED',
      subtotal: 10,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 10,
      fulfillments: { create: { vendorId, status: 'DELIVERED' } },
    },
  })
}

async function seedReview(opts: {
  productId: string
  vendorId: string
  customerId: string
  orderId: string
  rating: number
}) {
  return db.review.create({
    data: {
      orderId: opts.orderId,
      productId: opts.productId,
      vendorId: opts.vendorId,
      customerId: opts.customerId,
      rating: opts.rating,
      body: 'ok',
    },
  })
}

test('getProducts enriches every product with averageRating + totalReviews', async () => {
  const v = await createVendorUser()
  const buyer = await createUser('CUSTOMER')
  const order = await seedOrder(buyer.id, v.vendor.id)
  const p1 = await createActiveProduct(v.vendor.id)
  const p2 = await createActiveProduct(v.vendor.id)

  await seedReview({ productId: p1.id, vendorId: v.vendor.id, customerId: buyer.id, orderId: order.id, rating: 5 })

  const { products } = await getProducts()
  const lookup = new Map(products.map(p => [p.id, p]))

  const reviewed = lookup.get(p1.id)!
  assert.equal(reviewed.averageRating, 5)
  assert.equal(reviewed.totalReviews, 1)

  const unreviewed = lookup.get(p2.id)!
  assert.equal(unreviewed.averageRating, null)
  assert.equal(unreviewed.totalReviews, 0)
})

test('top_rated orders by averageRating desc, then by review count', async () => {
  const v = await createVendorUser()
  const buyerA = await createUser('CUSTOMER')
  const buyerB = await createUser('CUSTOMER')
  const orderA = await seedOrder(buyerA.id, v.vendor.id)
  const orderB = await seedOrder(buyerB.id, v.vendor.id)

  const bestProduct = await createActiveProduct(v.vendor.id)
  const midProduct = await createActiveProduct(v.vendor.id)
  const worstProduct = await createActiveProduct(v.vendor.id)

  // best: avg 5.0 (2 reviews)
  await seedReview({ productId: bestProduct.id, vendorId: v.vendor.id, customerId: buyerA.id, orderId: orderA.id, rating: 5 })
  await seedReview({ productId: bestProduct.id, vendorId: v.vendor.id, customerId: buyerB.id, orderId: orderB.id, rating: 5 })
  // mid: avg 4.0 (1 review)
  const orderMid = await seedOrder(buyerA.id, v.vendor.id)
  await seedReview({ productId: midProduct.id, vendorId: v.vendor.id, customerId: buyerA.id, orderId: orderMid.id, rating: 4 })
  // worst: avg 2.0 (1 review)
  const orderWorst = await seedOrder(buyerB.id, v.vendor.id)
  await seedReview({ productId: worstProduct.id, vendorId: v.vendor.id, customerId: buyerB.id, orderId: orderWorst.id, rating: 2 })

  const { products } = await getProducts({ sort: 'top_rated' })
  const order = products.map(p => p.id)

  assert.equal(order[0], bestProduct.id, 'highest average first')
  assert.equal(order[1], midProduct.id, '4.0 above 2.0')
  assert.equal(order[2], worstProduct.id, 'lowest last among rated')
})

test('top_rated backfills with unrated products when rated ones are few', async () => {
  const v = await createVendorUser()
  const buyer = await createUser('CUSTOMER')
  const order = await seedOrder(buyer.id, v.vendor.id)

  const rated = await createActiveProduct(v.vendor.id)
  const unrated1 = await createActiveProduct(v.vendor.id)
  const unrated2 = await createActiveProduct(v.vendor.id)

  await seedReview({ productId: rated.id, vendorId: v.vendor.id, customerId: buyer.id, orderId: order.id, rating: 5 })

  const { products } = await getProducts({ sort: 'top_rated' })

  assert.equal(products[0]?.id, rated.id, 'rated product comes first')
  const remainingIds = new Set(products.slice(1).map(p => p.id))
  assert.ok(remainingIds.has(unrated1.id), 'unrated products backfill')
  assert.ok(remainingIds.has(unrated2.id))
})
