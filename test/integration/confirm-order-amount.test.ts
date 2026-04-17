import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createOrder, confirmOrder } from '@/domains/orders/actions'
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

/**
 * Issue #418: confirmOrder (mock mode) must verify the Payment amount
 * matches the Order grandTotal — symmetric with the webhook handler's
 * doesWebhookPaymentMatchStoredPayment check.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
  Object.assign(process.env, { PAYMENT_PROVIDER: 'mock', NODE_ENV: 'test' })
  resetServerEnvCache()
})

afterEach(() => {
  clearTestSession()
  resetServerEnvCache()
})

test('confirmOrder succeeds when amount matches (happy path)', async () => {
  const buyer = await createUser('CUSTOMER')
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { basePrice: 15, stock: 10 })

  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const result = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    {
      address: { firstName: 'Test', lastName: 'OK', line1: 'Calle Mayor 10', city: 'Madrid', province: 'Madrid', postalCode: '28001' },
      saveAddress: false,
    }
  )

  const providerRef = result.clientSecret.replace('_secret', '')
  await confirmOrder(result.orderId, providerRef)

  const order = await db.order.findUnique({ where: { id: result.orderId } })
  assert.equal(order?.status, 'PAYMENT_CONFIRMED')
  assert.equal(order?.paymentStatus, 'SUCCEEDED')
})

test('confirmOrder rejects when Payment.amount is tampered (defensive mismatch)', async () => {
  const buyer = await createUser('CUSTOMER')
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, { basePrice: 20, stock: 10 })

  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const result = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    {
      address: { firstName: 'Test', lastName: 'Tamper', line1: 'Calle Mayor 10', city: 'Madrid', province: 'Madrid', postalCode: '28001' },
      saveAddress: false,
    }
  )

  // Simulate amount tampering: mutate the Payment row's amount AFTER
  // creation but BEFORE confirmation. In production this could only
  // happen through a DB injection or a bug in another code path.
  const payment = await db.payment.findFirst({ where: { orderId: result.orderId } })
  assert.ok(payment)
  await db.payment.update({
    where: { id: payment.id },
    data: { amount: 0.01 },
  })

  const providerRef = result.clientSecret.replace('_secret', '')
  await assert.rejects(
    () => confirmOrder(result.orderId, providerRef),
    /verificaci[óo]n del importe/i
  )

  // Order must NOT be confirmed
  const order = await db.order.findUnique({ where: { id: result.orderId } })
  assert.equal(order?.paymentStatus, 'PENDING')

  // A PAYMENT_MISMATCH event must be recorded
  const events = await db.orderEvent.findMany({
    where: { orderId: result.orderId, type: 'PAYMENT_MISMATCH' },
  })
  assert.equal(events.length, 1)
})
