import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { reportReview } from '@/domains/reviews/actions'
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
 * Trust + abuse controls for reviews (#571). The report surface
 * shares identity semantics with the rest of the domain: every write
 * is scoped to the caller, and the vendor + buyer that own the
 * content cannot use report-as-self to bypass their own moderation
 * flow (delete / respond). Pins the invariants here.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
  Object.assign(process.env, { NODE_ENV: 'test' })
})

afterEach(() => {
  clearTestSession()
})

async function seedReviewWithResponse() {
  const buyer = await createUser('CUSTOMER')
  const reporter = await createUser('CUSTOMER')
  const { user: vendorUser, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id)

  const order = await db.order.create({
    data: {
      orderNumber: `RR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId: buyer.id,
      status: 'DELIVERED',
      paymentStatus: 'SUCCEEDED',
      subtotal: 10,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 10,
    },
  })

  const review = await db.review.create({
    data: {
      orderId: order.id,
      productId: product.id,
      vendorId: vendor.id,
      customerId: buyer.id,
      rating: 5,
      body: 'great',
      vendorResponse: 'thanks',
      vendorResponseAt: new Date(),
    },
  })

  return { buyer, reporter, vendorUser, vendor, product, review }
}

test('reportReview creates a ReviewReport row and is idempotent on the (review, reporter, target) tuple', async () => {
  const { reporter, review } = await seedReviewWithResponse()

  useTestSession(buildSession(reporter.id, 'CUSTOMER'))
  const first = await reportReview({ reviewId: review.id, reason: 'SPAM' })
  const second = await reportReview({ reviewId: review.id, reason: 'OFFENSIVE' }) // second tap

  assert.equal(first.id, second.id, 'second report on same (review, reporter, target) returns existing row')
  const rows = await db.reviewReport.findMany({ where: { reviewId: review.id } })
  assert.equal(rows.length, 1, 'UNIQUE (reviewId, reporterId, target) holds')
  assert.equal(rows[0]?.reason, 'SPAM', 'first-writer wins; idempotent no-op does NOT overwrite the reason')
})

test('reportReview refuses an unauthenticated caller', async () => {
  const { review } = await seedReviewWithResponse()
  useTestSession(null)
  await assert.rejects(() => reportReview({ reviewId: review.id, reason: 'SPAM' }))
})

test('reportReview refuses the buyer that wrote the review (REVIEW_BODY target)', async () => {
  const { buyer, review } = await seedReviewWithResponse()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  await assert.rejects(
    () => reportReview({ reviewId: review.id, reason: 'FAKE' }),
    /No puedes reportar tu propia reseña/,
  )
})

test('reportReview refuses the vendor that wrote the response (VENDOR_RESPONSE target)', async () => {
  const { vendorUser, review } = await seedReviewWithResponse()
  useTestSession(buildSession(vendorUser.id, 'VENDOR'))
  await assert.rejects(
    () => reportReview({ reviewId: review.id, reason: 'OFFENSIVE', target: 'VENDOR_RESPONSE' }),
    /No puedes reportar tu propia respuesta/,
  )
})

test('reportReview allows the buyer to flag a vendor response on their own review', async () => {
  const { buyer, review } = await seedReviewWithResponse()
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  await reportReview({
    reviewId: review.id,
    reason: 'OFFENSIVE',
    target: 'VENDOR_RESPONSE',
  })
  const rows = await db.reviewReport.findMany({ where: { reviewId: review.id } })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.target, 'VENDOR_RESPONSE')
  assert.equal(rows[0]?.reporterId, buyer.id)
})

test('reportReview rejects a VENDOR_RESPONSE report when the review has no response', async () => {
  const buyer = await createUser('CUSTOMER')
  const reporter = await createUser('CUSTOMER')
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id)
  const order = await db.order.create({
    data: {
      orderNumber: `RR2-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId: buyer.id,
      status: 'DELIVERED',
      paymentStatus: 'SUCCEEDED',
      subtotal: 10,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 10,
    },
  })
  const review = await db.review.create({
    data: {
      orderId: order.id,
      productId: product.id,
      vendorId: vendor.id,
      customerId: buyer.id,
      rating: 3,
      body: 'ok',
    },
  })

  useTestSession(buildSession(reporter.id, 'CUSTOMER'))
  await assert.rejects(
    () => reportReview({ reviewId: review.id, reason: 'SPAM', target: 'VENDOR_RESPONSE' }),
    /no tiene respuesta del productor/,
  )
})
