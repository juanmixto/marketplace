import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { POST } from '@/app/api/webhooks/stripe/route'
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
import { createOrder } from '@/domains/orders/actions'

beforeEach(async () => {
  await resetIntegrationDatabase()

  Object.assign(process.env, {
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/marketplace',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    PAYMENT_PROVIDER: 'mock',
  })
  resetServerEnvCache()
})

afterEach(() => {
  clearTestSession()
  resetServerEnvCache()
})

test('stripe webhook ignores payment intents with a mismatched amount and accepts matching ones', async () => {
  const customer = await createUser('CUSTOMER')
  const order = await db.order.create({
    data: {
      orderNumber: `ord_${randomUUID().slice(0, 8)}`,
      customerId: customer.id,
      status: 'PLACED',
      paymentStatus: 'PENDING',
      subtotal: 12.34,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 12.34,
    },
  })

  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      provider: 'stripe',
      providerRef: `pi_${randomUUID().slice(0, 8)}`,
      amount: 12.34,
      currency: 'EUR',
      status: 'PENDING',
    },
  })
  const amountCents = Math.round(Number(payment.amount) * 100)

  const mismatchResponse = await POST(
    new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'evt_mismatch',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: payment.providerRef,
            amount: amountCents + 1,
            currency: payment.currency,
          },
        },
      }),
    }) as any
  )

  assert.equal(mismatchResponse.status, 200)

  const afterMismatch = await db.order.findUnique({
    where: { id: order.id },
    include: { payments: true, events: true },
  })

  assert.equal(afterMismatch?.paymentStatus, 'PENDING')
  assert.equal(afterMismatch?.status, 'PLACED')
  assert.equal(afterMismatch?.payments[0]?.status, 'PENDING')
  assert.equal(afterMismatch?.events.at(-1)?.type, 'PAYMENT_MISMATCH')

  const successResponse = await POST(
    new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'evt_success',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: payment.providerRef,
            amount: amountCents,
            currency: payment.currency,
          },
        },
      }),
    }) as any
  )

  assert.equal(successResponse.status, 200)

  const updated = await db.order.findUnique({
    where: { id: order.id },
    include: { payments: true },
  })

  assert.equal(updated?.paymentStatus, 'SUCCEEDED')
  assert.equal(updated?.status, 'PAYMENT_CONFIRMED')
  assert.equal(updated?.payments[0]?.status, 'SUCCEEDED')
})

async function createOrderWithPayment(amountEuros: number) {
  const customer = await createUser('CUSTOMER')
  const order = await db.order.create({
    data: {
      orderNumber: `ord_${randomUUID().slice(0, 8)}`,
      customerId: customer.id,
      status: 'PLACED',
      paymentStatus: 'PENDING',
      subtotal: amountEuros,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: amountEuros,
    },
  })
  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      provider: 'stripe',
      providerRef: `pi_${randomUUID().slice(0, 8)}`,
      amount: amountEuros,
      currency: 'EUR',
      status: 'PENDING',
    },
  })
  return { order, payment }
}

test('stripe webhook rejects payment in wrong currency and emits PAYMENT_MISMATCH', async () => {
  const { order, payment } = await createOrderWithPayment(50)
  const amountCents = Math.round(Number(payment.amount) * 100)

  await POST(
    new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'evt_currency_mismatch',
        type: 'payment_intent.succeeded',
        data: { object: { id: payment.providerRef, amount: amountCents, currency: 'usd' } },
      }),
    }) as any
  )

  const result = await db.order.findUnique({
    where: { id: order.id },
    include: { events: true },
  })

  assert.equal(result?.paymentStatus, 'PENDING')
  assert.equal(result?.status, 'PLACED')
  assert.equal(result?.events.at(-1)?.type, 'PAYMENT_MISMATCH')
})

test('stripe webhook ignores payment_intent.succeeded without amount and emits PAYMENT_MISMATCH', async () => {
  const { order, payment } = await createOrderWithPayment(25)

  await POST(
    new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'evt_no_amount',
        type: 'payment_intent.succeeded',
        data: { object: { id: payment.providerRef } },
      }),
    }) as any
  )

  const result = await db.order.findUnique({
    where: { id: order.id },
    include: { events: true },
  })

  assert.equal(result?.paymentStatus, 'PENDING')
  assert.equal(result?.events.at(-1)?.type, 'PAYMENT_MISMATCH')
})

test('createOrder stores server-calculated grandTotal — client cannot influence the stored amount', async () => {
  // The Cart only carries productId + quantity, never prices.
  // This test verifies the stored Payment.amount matches what the server
  // calculated from DB prices, not anything the client could have sent.
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  // basePrice=20, taxRate=0.1, shipping=4.95 → grandTotal=24.95
  const product = await createActiveProduct(vendor.id, { basePrice: 20, taxRate: 0.1, stock: 5 })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))

  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    {
      address: {
        firstName: 'Ada', lastName: 'Lovelace',
        line1: 'Calle Mayor 1', city: 'Madrid',
        province: 'Madrid', postalCode: '28001',
      },
      saveAddress: false,
    }
  )

  const payment = await db.payment.findFirst({ where: { orderId: created.orderId } })
  const order = await db.order.findUnique({ where: { id: created.orderId } })

  assert.ok(payment)
  assert.equal(Number(payment.amount), Number(order?.grandTotal))
  // Server-calculated: 20 (product) + 4.95 (flat shipping) = 24.95
  assert.equal(Number(order?.grandTotal), 24.95)
})
