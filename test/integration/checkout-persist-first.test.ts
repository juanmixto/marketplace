import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createOrder } from '@/domains/orders/actions'
import { setTestCreatePaymentIntentOverride } from '@/domains/payments/provider'
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
 * Issue #404: persist-first refactor for createOrder. The Stripe
 * PaymentIntent must be created AFTER the DB transaction commits, so a
 * failure inside the transaction cannot leave an orphan external
 * PaymentIntent. These tests pin the new contract:
 *
 *   - happy path: a Payment row exists with the real providerRef
 *   - provider-failure path: the Order exists, the Payment row is
 *     marked FAILED with providerRef = null, an OrderEvent of type
 *     PAYMENT_INTENT_CREATION_FAILED is emitted, and the caller sees
 *     the underlying error (createCheckoutOrder maps it to a friendly
 *     message via getCheckoutErrorMessage).
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
  Object.assign(process.env, { PAYMENT_PROVIDER: 'mock' })
  resetServerEnvCache()
})

afterEach(() => {
  clearTestSession()
  setTestCreatePaymentIntentOverride(undefined)
  resetServerEnvCache()
})

async function buildCheckoutInputs() {
  const buyer = await createUser('CUSTOMER')
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, {
    basePrice: 12,
    stock: 5,
    trackStock: true,
  })
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  return {
    buyer,
    product,
    items: [{ productId: product.id, quantity: 1 }],
    formData: {
      address: {
        firstName: 'Persist',
        lastName: 'First',
        line1: 'Calle Lab 1',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
      },
      saveAddress: false,
    },
  }
}

test('happy path (mock): creates Order + Payment with providerRef set after commit', async () => {
  const { buyer, items, formData } = await buildCheckoutInputs()

  const result = await createOrder(items, formData)
  assert.ok(result.orderId)
  assert.ok(result.clientSecret.startsWith('mock_pi_'))

  const order = await db.order.findUnique({
    where: { id: result.orderId },
    include: { payments: true },
  })
  assert.ok(order, 'order must exist')
  assert.equal(order.customerId, buyer.id)
  assert.equal(order.payments.length, 1)
  const payment = order.payments[0]!
  assert.equal(payment.status, 'PENDING')
  assert.equal(payment.provider, 'mock')
  assert.ok(payment.providerRef, 'providerRef must be linked back after commit')
  assert.ok(payment.providerRef.startsWith('mock_pi_'))
})

test('provider failure post-commit: order persists, Payment row marked FAILED, OrderEvent emitted', async () => {
  const { items, formData } = await buildCheckoutInputs()

  // Force createPaymentIntent to throw AFTER the DB transaction has
  // committed. The provider exposes a test-only override hook that
  // returns whatever this function returns (or throws what it throws).
  setTestCreatePaymentIntentOverride(async () => {
    throw new Error('stripe down: simulated post-commit failure')
  })

  await assert.rejects(
    () => createOrder(items, formData),
    /stripe down: simulated post-commit failure/i
  )

  // The Order MUST still exist (transaction committed). Find by the
  // last placed customer order.
  const orders = await db.order.findMany({
    orderBy: { placedAt: 'desc' },
    include: { payments: true, events: true },
  })
  assert.equal(orders.length, 1, 'exactly one order persisted')
  const order = orders[0]!
  assert.equal(order.paymentStatus, 'FAILED')
  assert.equal(order.payments.length, 1)
  const payment = order.payments[0]!
  assert.equal(payment.status, 'FAILED')
  assert.equal(payment.providerRef, null)

  const failureEvent = order.events.find(
    e => e.type === 'PAYMENT_INTENT_CREATION_FAILED'
  )
  assert.ok(failureEvent, 'PAYMENT_INTENT_CREATION_FAILED event must be emitted')
})

test('stock conflict inside transaction: NO payment provider call, no Payment row', async () => {
  const { items, formData, product } = await buildCheckoutInputs()
  // Drain the stock so the transaction throws on the FOR UPDATE check.
  await db.product.update({
    where: { id: product.id },
    data: { stock: 0 },
  })

  // Spy on createPaymentIntent so we can assert it was NEVER called.
  // The override would normally throw if invoked; we count calls via
  // a closure counter.
  let providerCalls = 0
  setTestCreatePaymentIntentOverride(async () => {
    providerCalls += 1
    throw new Error('createPaymentIntent should NOT be called when stock fails')
  })

  await assert.rejects(() => createOrder(items, formData), /Stock insuficiente/i)

  assert.equal(providerCalls, 0, 'createPaymentIntent must not run on stock failure')

  const orders = await db.order.findMany()
  assert.equal(orders.length, 0)
  const payments = await db.payment.findMany()
  assert.equal(payments.length, 0)
})
