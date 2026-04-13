import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createProduct, deleteProduct, submitForReview } from '@/domains/vendors/actions'
import { db } from '@/lib/db'
import {
  buildSession,
  clearTestSession,
  createActiveProduct,
  createVendorUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

test('createProduct persists a vendor product and deleteProduct performs a soft delete', async () => {
  const { user, vendor } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const created = await createProduct({
    name: 'Tomate de temporada',
    description: 'Recien recogido',
    categoryId: undefined,
    basePrice: 4.5,
    compareAtPrice: undefined,
    taxRate: 0.1,
    unit: 'kg',
    stock: 12,
    trackStock: true,
    certifications: [],
    originRegion: 'Navarra',
    images: [],
    expiresAt: undefined,
    status: 'DRAFT',
  })

  const stored = await db.product.findUnique({ where: { id: created.id } })
  assert.equal(stored?.vendorId, vendor.id)
  assert.equal(stored?.deletedAt, null)

  await deleteProduct(created.id)

  const deleted = await db.product.findUnique({ where: { id: created.id } })
  assert.ok(deleted?.deletedAt)
  assert.equal(deleted?.status, 'SUSPENDED')
})

test('createProduct accepts local /uploads/ paths and rejects arbitrary URLs', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const created = await createProduct({
    name: 'Calabacín bio',
    description: 'De la huerta',
    categoryId: undefined,
    basePrice: 2.5,
    compareAtPrice: undefined,
    taxRate: 0.1,
    unit: 'kg',
    stock: 8,
    trackStock: true,
    certifications: [],
    originRegion: 'Navarra',
    images: ['/uploads/products/vendor-x/abc.jpg'],
    expiresAt: undefined,
    status: 'DRAFT',
  })
  const stored = await db.product.findUnique({ where: { id: created.id } })
  assert.deepEqual(stored?.images, ['/uploads/products/vendor-x/abc.jpg'])

  await assert.rejects(
    () =>
      createProduct({
        name: 'Calabacín bio 2',
        description: 'De la huerta',
        categoryId: undefined,
        basePrice: 2.5,
        compareAtPrice: undefined,
        taxRate: 0.1,
        unit: 'kg',
        stock: 8,
        trackStock: true,
        certifications: [],
        originRegion: 'Navarra',
        images: ['http://evil.example.com/x.jpg'],
        expiresAt: undefined,
        status: 'DRAFT',
      }),
    /URL de imagen no permitida/i,
  )
})

test('deleteProduct rejects products with active orders', async () => {
  const { user, vendor } = await createVendorUser()
  const customer = await db.user.create({
    data: {
      email: 'buyer-active-order@example.com',
      firstName: 'Buyer',
      lastName: 'Active',
      role: 'CUSTOMER',
      isActive: true,
    },
  })
  const product = await createActiveProduct(vendor.id)
  const order = await db.order.create({
    data: {
      orderNumber: 'MKP-TEST-1',
      customerId: customer.id,
      subtotal: 12,
      shippingCost: 0,
      taxAmount: 1.09,
      grandTotal: 12,
      status: 'PROCESSING',
      paymentStatus: 'SUCCEEDED',
    },
  })
  await db.orderLine.create({
    data: {
      orderId: order.id,
      productId: product.id,
      vendorId: vendor.id,
      quantity: 1,
      unitPrice: 12,
      taxRate: 0.1,
      productSnapshot: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        images: [],
        unit: product.unit,
        vendorName: vendor.displayName,
      },
    },
  })

  useTestSession(buildSession(user.id, 'VENDOR'))

  await assert.rejects(() => deleteProduct(product.id), /pedidos activos/i)
})

test('submitForReview moves draft products into pending review and rejects active products', async () => {
  const { user, vendor } = await createVendorUser()
  const draftProduct = await createActiveProduct(vendor.id, { status: 'DRAFT' })
  const activeProduct = await createActiveProduct(vendor.id, { slug: 'activo-test', status: 'ACTIVE' })
  useTestSession(buildSession(user.id, 'VENDOR'))

  await submitForReview(draftProduct.id)

  const updatedDraft = await db.product.findUnique({ where: { id: draftProduct.id } })
  assert.equal(updatedDraft?.status, 'PENDING_REVIEW')

  await assert.rejects(() => submitForReview(activeProduct.id), /no se puede enviar a revisión/i)
})
