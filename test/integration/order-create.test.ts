import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { confirmOrder, createCheckoutOrder, createOrder } from '@/domains/orders/actions'
import { db } from '@/lib/db'
import { resetServerEnvCache } from '@/lib/env'
import {
  buildSession,
  clearTestSession,
  createActiveProduct,
  createUser,
  createVendorUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
  process.env.PAYMENT_PROVIDER = 'mock'
  resetServerEnvCache()
})

test('createOrder creates order, lines and fulfillments for valid items', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 5 })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  const created = await createOrder(
    [{ productId: product.id, quantity: 2 }],
    {
      address: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        line1: 'Calle Mayor 1',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
      },
      saveAddress: false,
    }
  )

  const order = await db.order.findUnique({
    where: { id: created.orderId },
    include: { lines: true, fulfillments: true, payments: true },
  })
  const refreshedProduct = await db.product.findUnique({
    where: { id: product.id },
    select: { stock: true },
  })

  assert.ok(order)
  assert.equal(order?.lines.length, 1)
  assert.equal(order?.fulfillments.length, 1)
  assert.equal(order?.payments.length, 1)
  assert.equal(order?.paymentStatus, 'PENDING')
  assert.equal(refreshedProduct?.stock, 3)
})

test('createOrder stores a shipping address snapshot even when the address is not saved', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 5 })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    {
      address: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        line1: 'Calle Mayor 1',
        line2: '2A',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
        phone: '600000000',
      },
      saveAddress: false,
    }
  )

  const order = await db.order.findUnique({
    where: { id: created.orderId },
    select: { addressId: true, shippingAddressSnapshot: true },
  })

  assert.equal(order?.addressId, null)
  assert.deepEqual(order?.shippingAddressSnapshot, {
    firstName: 'Ada',
    lastName: 'Lovelace',
    line1: 'Calle Mayor 1',
    line2: '2A',
    city: 'Madrid',
    province: 'Madrid',
    postalCode: '28001',
    phone: '600000000',
  })
})

test('createOrder rejects products without enough stock', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 1 })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  await assert.rejects(
    () => createOrder(
      [{ productId: product.id, quantity: 3 }],
      {
        address: {
          firstName: 'Ada',
          lastName: 'Lovelace',
          line1: 'Calle Mayor 1',
          city: 'Madrid',
          province: 'Madrid',
          postalCode: '28001',
        },
        saveAddress: false,
      }
    ),
    /stock insuficiente/i
  )
})

test('createCheckoutOrder returns a friendly stock error and avoids saving the address when checkout fails', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 1 })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  const result = await createCheckoutOrder(
    [{ productId: product.id, quantity: 3 }],
    {
      address: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        line1: 'Calle Mayor 1',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
      },
      saveAddress: true,
    }
  )

  assert.equal(result.ok, false)
  assert.match(result.error, /stock insuficiente/i)

  const savedAddresses = await db.address.findMany({ where: { userId: customer.id } })
  assert.equal(savedAddresses.length, 0)
})

test('createOrder reuses the selected saved address instead of creating a duplicate', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 4 })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  const existingAddress = await db.address.create({
    data: {
      userId: customer.id,
      firstName: 'Ada',
      lastName: 'Lovelace',
      line1: 'Calle Mayor 1',
      city: 'Madrid',
      province: 'Madrid',
      postalCode: '28001',
      isDefault: true,
    },
  })

  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    {
      address: {
        firstName: existingAddress.firstName,
        lastName: existingAddress.lastName,
        line1: existingAddress.line1,
        city: existingAddress.city,
        province: existingAddress.province,
        postalCode: existingAddress.postalCode,
      },
      saveAddress: true,
      selectedAddressId: existingAddress.id,
    }
  )

  const order = await db.order.findUnique({
    where: { id: created.orderId },
    select: { addressId: true },
  })
  const addresses = await db.address.findMany({
    where: { userId: customer.id },
    orderBy: { createdAt: 'asc' },
  })

  assert.equal(order?.addressId, existingAddress.id)
  assert.equal(addresses.length, 1)
  assert.equal(addresses[0]?.id, existingAddress.id)
})

test('createOrder falls back to the submitted address when a saved address goes stale', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 4 })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    {
      address: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        line1: 'Calle Mayor 1',
        line2: '2A',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
        phone: '600000000',
      },
      saveAddress: false,
      selectedAddressId: 'addr_missing',
    }
  )

  const order = await db.order.findUnique({
    where: { id: created.orderId },
    select: { addressId: true, shippingAddressSnapshot: true },
  })

  assert.equal(order?.addressId, null)
  assert.deepEqual(order?.shippingAddressSnapshot, {
    firstName: 'Ada',
    lastName: 'Lovelace',
    line1: 'Calle Mayor 1',
    line2: '2A',
    city: 'Madrid',
    province: 'Madrid',
    postalCode: '28001',
    phone: '600000000',
  })
})

test('createOrder auto-assigns the default variant when the cart item arrives without variantId', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, {
    name: 'Tomates cherry ecológicos',
    stock: 12,
  })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  await db.productVariant.create({
    data: {
      productId: product.id,
      sku: `sku-${product.id}-agotada`,
      name: 'Caja agotada',
      priceModifier: 0,
      stock: 0,
      isActive: true,
    },
  })
  const defaultVariant = await db.productVariant.create({
    data: {
      productId: product.id,
      sku: `sku-${product.id}-bandeja-500`,
      name: 'Bandeja 500 g',
      priceModifier: 1.5,
      stock: 8,
      isActive: true,
    },
  })

  const created = await createOrder(
    [{ productId: product.id, quantity: 2 }],
    {
      address: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        line1: 'Calle Mayor 1',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
      },
      saveAddress: false,
    }
  )

  const order = await db.order.findUnique({
    where: { id: created.orderId },
    include: { lines: true },
  })
  const refreshedVariant = await db.productVariant.findUnique({
    where: { id: defaultVariant.id },
    select: { stock: true },
  })

  assert.equal(order?.lines[0]?.variantId, defaultVariant.id)
  assert.equal((order?.lines[0]?.productSnapshot as { variantName?: string } | undefined)?.variantName, 'Bandeja 500 g')
  assert.equal(Number(order?.lines[0]?.unitPrice ?? 0), 13.5)
  assert.equal(refreshedVariant?.stock, 6)
})

test('confirmOrder marks payment as succeeded', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 3 })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    {
      address: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        line1: 'Calle Mayor 1',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
      },
      saveAddress: false,
    }
  )

  const payment = await db.payment.findFirst({
    where: { orderId: created.orderId },
  })
  assert.ok(payment?.providerRef)

  await confirmOrder(created.orderId, payment.providerRef)

  const updated = await db.order.findUnique({
    where: { id: created.orderId },
    include: { payments: true },
  })

  assert.equal(updated?.paymentStatus, 'SUCCEEDED')
  assert.equal(updated?.status, 'PAYMENT_CONFIRMED')
  assert.equal(updated?.payments[0]?.status, 'SUCCEEDED')
})

test('createOrder rejects zero or negative quantities', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 5 })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  await assert.rejects(
    () => createOrder(
      [{ productId: product.id, quantity: 0 }],
      {
        address: {
          firstName: 'Ada',
          lastName: 'Lovelace',
          line1: 'Calle Mayor 1',
          city: 'Madrid',
          province: 'Madrid',
          postalCode: '28001',
        },
        saveAddress: false,
      }
    ),
    /cantidad debe ser un entero positivo/i
  )
})

test('createOrder rejects duplicate product and variant combinations', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 5 })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  await assert.rejects(
    () => createOrder(
      [
        { productId: product.id, quantity: 1 },
        { productId: product.id, quantity: 1 },
      ],
      {
        address: {
          firstName: 'Ada',
          lastName: 'Lovelace',
          line1: 'Calle Mayor 1',
          city: 'Madrid',
          province: 'Madrid',
          postalCode: '28001',
        },
        saveAddress: false,
      }
    ),
    /productos duplicados/i
  )
})

test('confirmOrder rejects manual confirmation outside mock mode', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 3 })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    {
      address: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        line1: 'Calle Mayor 1',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
      },
      saveAddress: false,
    }
  )

  const payment = await db.payment.findFirst({
    where: { orderId: created.orderId },
  })
  assert.ok(payment?.providerRef)

  process.env.PAYMENT_PROVIDER = 'stripe'
  process.env.STRIPE_SECRET_KEY = 'sk_test_123'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123'
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_123'
  resetServerEnvCache()

  await assert.rejects(
    () => confirmOrder(created.orderId, payment.providerRef!),
    /solo esta disponible en modo mock/i
  )
})

test('confirmOrder rejects orders that belong to a different customer', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const otherCustomer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 3 })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    {
      address: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        line1: 'Calle Mayor 1',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
      },
      saveAddress: false,
    }
  )

  const payment = await db.payment.findFirst({
    where: { orderId: created.orderId },
  })
  assert.ok(payment?.providerRef)

  useTestSession(buildSession(otherCustomer.id, 'CUSTOMER'))

  await assert.rejects(
    () => confirmOrder(created.orderId, payment.providerRef!),
    /no puedes confirmar un pedido que no te pertenece/i
  )
})

const CHECKOUT_FORM = {
  address: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    line1: 'Calle Mayor 1',
    city: 'Madrid',
    province: 'Madrid',
    postalCode: '28001',
  },
  saveAddress: false as const,
}

test('concurrent orders for last unit: only one succeeds, stock never goes negative', async () => {
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { stock: 1 })
  const customer = await createUser('CUSTOMER')
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  // Ten concurrent attempts from the same customer race to buy the last unit.
  // Keeping a single test session avoids races on the global auth test helper.
  const CONCURRENCY = 10
  const results = await Promise.allSettled(
    Array.from({ length: CONCURRENCY }, () => createOrder([{ productId: product.id, quantity: 1 }], CHECKOUT_FORM))
  )

  const succeeded = results.filter(r => r.status === 'fulfilled')
  const failed = results.filter(r => r.status === 'rejected')

  assert.equal(succeeded.length, 1, 'Exactly one order should succeed')
  assert.equal(failed.length, CONCURRENCY - 1, `${CONCURRENCY - 1} orders should be rejected`)

  const finalProduct = await db.product.findUnique({ where: { id: product.id } })
  assert.equal(finalProduct?.stock, 0, 'Stock must be exactly 0, never negative')
})

test('concurrent orders for last unit with variants: only one succeeds, variant stock never negative', async () => {
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { stock: 0, trackStock: true })
  const variant = await db.productVariant.create({
    data: {
      productId: product.id,
      sku: `SKU-CONCURRENCY-${Date.now()}`,
      name: 'Talla M',
      priceModifier: 0,
      stock: 1,
      isActive: true,
    },
  })

  const CONCURRENCY = 8
  const results = await Promise.allSettled(
    Array.from({ length: CONCURRENCY }, async () => {
      const customer = await createUser('CUSTOMER')
      useTestSession(buildSession(customer.id, 'CUSTOMER'))
      return createOrder(
        [{ productId: product.id, variantId: variant.id, quantity: 1 }],
        CHECKOUT_FORM
      )
    })
  )

  const succeeded = results.filter(r => r.status === 'fulfilled')
  assert.equal(succeeded.length, 1, 'Exactly one order should succeed for the variant')

  const finalVariant = await db.productVariant.findUnique({ where: { id: variant.id } })
  assert.equal(finalVariant?.stock, 0, 'Variant stock must be exactly 0, never negative')
})
