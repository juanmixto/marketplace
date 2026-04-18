import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { reviewProduct, suspendProduct } from '@/domains/admin/actions'
import { updateVendorProfile } from '@/domains/vendors/actions'
import { canLeaveReview, createReview } from '@/domains/reviews/actions'
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
 * Fills in the gaps from #268 — vendor / admin / review mutations
 * whose happy path wasn't yet directly covered on main:
 *   - reviewProduct(approve)  (reject path pinned in admin-sub-role-gates)
 *   - suspendProduct
 *   - updateVendorProfile (happy + schema rejection)
 *   - canLeaveReview branch matrix
 *   - createReview duplicate-constraint path
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
  Object.assign(process.env, { NODE_ENV: 'test' })
})

afterEach(() => {
  clearTestSession()
})

async function seedAdminSession() {
  const admin = await createUser('SUPERADMIN')
  useTestSession(buildSession(admin.id, 'SUPERADMIN'))
  return admin
}

async function seedReviewableOrder(customerId: string, vendorId: string, productId: string) {
  return db.order.create({
    data: {
      orderNumber: `MT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId,
      status: 'DELIVERED',
      paymentStatus: 'SUCCEEDED',
      subtotal: 10,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 10,
      lines: {
        create: {
          productId,
          vendorId,
          quantity: 1,
          unitPrice: 10,
          taxRate: 0.1,
          productSnapshot: { name: 'ok' },
        },
      },
      fulfillments: { create: { vendorId, status: 'DELIVERED' } },
    },
  })
}

// ─── admin: reviewProduct / suspendProduct ─────────────────────────────────

test('reviewProduct(approve) moves PENDING_REVIEW to ACTIVE and clears rejectionNote', async () => {
  const { vendor } = await createVendorUser()
  await seedAdminSession()
  const product = await createActiveProduct(vendor.id, {
    status: 'PENDING_REVIEW',
    rejectionNote: 'previous rejection note',
  })

  await reviewProduct(product.id, 'approve')

  const fresh = await db.product.findUnique({ where: { id: product.id } })
  assert.equal(fresh?.status, 'ACTIVE')
  assert.equal(fresh?.rejectionNote, null)
})

test('reviewProduct(approve) rejects vendors without Stripe onboarding', async () => {
  const { vendor } = await createVendorUser()
  await db.vendor.update({
    where: { id: vendor.id },
    data: { stripeOnboarded: false, stripeAccountId: null },
  })
  await seedAdminSession()
  const product = await createActiveProduct(vendor.id, { status: 'PENDING_REVIEW' })

  await assert.rejects(() => reviewProduct(product.id, 'approve'))

  const fresh = await db.product.findUnique({ where: { id: product.id } })
  assert.equal(fresh?.status, 'PENDING_REVIEW', 'status untouched after failed approval')
})

test('reviewProduct refuses to act on products not in PENDING_REVIEW', async () => {
  const { vendor } = await createVendorUser()
  await seedAdminSession()
  const product = await createActiveProduct(vendor.id, { status: 'ACTIVE' })

  await assert.rejects(
    () => reviewProduct(product.id, 'approve'),
    /no está en revisión/,
  )
})

test('suspendProduct flips status to SUSPENDED and stores the reason', async () => {
  const { vendor } = await createVendorUser()
  await seedAdminSession()
  const product = await createActiveProduct(vendor.id, { status: 'ACTIVE' })

  await suspendProduct(product.id, 'Calidad insuficiente en fotos')

  const fresh = await db.product.findUnique({ where: { id: product.id } })
  assert.equal(fresh?.status, 'SUSPENDED')
  assert.equal(fresh?.rejectionNote, 'Calidad insuficiente en fotos')
})

// ─── vendor: updateVendorProfile ───────────────────────────────────────────

test('updateVendorProfile persists valid fields and returns the fresh row', async () => {
  const { user, vendor } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const updated = await updateVendorProfile({
    displayName: 'Nuevo nombre',
    description: 'Somos una granja familiar desde 1982',
    location: 'Granada',
    category: 'FARM',
  })

  assert.equal(updated.displayName, 'Nuevo nombre')
  assert.equal(updated.category, 'FARM')
  const fresh = await db.vendor.findUnique({ where: { id: vendor.id } })
  assert.equal(fresh?.displayName, 'Nuevo nombre')
})

test('updateVendorProfile rejects displayName below the minimum length', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  await assert.rejects(() => updateVendorProfile({ displayName: 'ab' }))
})

test('updateVendorProfile rejects disallowed image URLs', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  await assert.rejects(
    () =>
      updateVendorProfile({
        displayName: 'Granja Test',
        logo: 'https://evil.example.com/pic.jpg',
      }),
    /Imagen no permitida/,
  )
})

// ─── reviews: canLeaveReview + createReview duplicate ─────────────────────

test('canLeaveReview returns false when the caller is not authenticated', async () => {
  useTestSession(null)
  const allowed = await canLeaveReview('ord-x', 'prod-x')
  assert.equal(allowed, false)
})

test('canLeaveReview returns false for an order the caller does not own', async () => {
  const buyerA = await createUser('CUSTOMER')
  const buyerB = await createUser('CUSTOMER')
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id)
  const order = await seedReviewableOrder(buyerA.id, vendor.id, product.id)

  useTestSession(buildSession(buyerB.id, 'CUSTOMER'))
  const allowed = await canLeaveReview(order.id, product.id)
  assert.equal(allowed, false)
})

test('canLeaveReview returns true for a delivered order owned by the caller', async () => {
  const buyer = await createUser('CUSTOMER')
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id)
  const order = await seedReviewableOrder(buyer.id, vendor.id, product.id)

  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const allowed = await canLeaveReview(order.id, product.id)
  assert.equal(allowed, true)
})

test('canLeaveReview returns false once a review already exists for the (order, product)', async () => {
  const buyer = await createUser('CUSTOMER')
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id)
  const order = await seedReviewableOrder(buyer.id, vendor.id, product.id)

  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  await createReview(order.id, product.id, 5, 'fantástico')

  const allowed = await canLeaveReview(order.id, product.id)
  assert.equal(allowed, false, 'cannot review the same order/product twice')
})

test('createReview rejects a duplicate review for the same (order, product)', async () => {
  const buyer = await createUser('CUSTOMER')
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id)
  const order = await seedReviewableOrder(buyer.id, vendor.id, product.id)

  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  await createReview(order.id, product.id, 5, 'primera')

  await assert.rejects(() => createReview(order.id, product.id, 4, 'segunda'))

  const reviews = await db.review.findMany({
    where: { orderId: order.id, productId: product.id },
  })
  assert.equal(reviews.length, 1, 'UNIQUE (orderId, productId) holds')
})
