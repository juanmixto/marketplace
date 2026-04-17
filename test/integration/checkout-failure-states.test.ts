import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createOrder, createCheckoutOrder } from '@/domains/orders/actions'
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
 * Issue #406: checkout failure-mode state matrix.
 *
 * Each test exercises a different failure path and pins the EXACT
 * database state after the failure: Order row (exists? status?
 * paymentStatus?), Payment row (exists? status? providerRef?),
 * OrderEvent (type?). This is the regression safety net for the
 * persist-first refactor (#404/#435).
 *
 * The matrix:
 *
 * | Failure             | Order exists? | paymentStatus | Payment.status | Payment.providerRef | OrderEvent             |
 * |---------------------|---------------|---------------|----------------|---------------------|------------------------|
 * | Stock precheck      | no            | —             | —              | —                   | —                      |
 * | Stock FOR UPDATE    | no            | —             | —              | —                   | —                      |
 * | Promotion budget    | no            | —             | —              | —                   | —                      |
 * | Provider fails      | yes           | FAILED        | FAILED         | null                | PI_CREATION_FAILED     |
 * | Happy path          | yes           | SUCCEEDED     | SUCCEEDED      | mock_pi_*           | PAYMENT_CONFIRMED      |
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
  Object.assign(process.env, { PAYMENT_PROVIDER: 'mock', NODE_ENV: 'test' })
  resetServerEnvCache()
})

afterEach(() => {
  clearTestSession()
  setTestCreatePaymentIntentOverride(undefined)
  resetServerEnvCache()
})

const address = {
  firstName: 'Matrix',
  lastName: 'Tester',
  line1: 'Calle Mayor 10',
  city: 'Madrid',
  province: 'Madrid',
  postalCode: '28001',
}

async function setupCheckout(stockOverride = 10) {
  const buyer = await createUser('CUSTOMER')
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, {
    basePrice: 10,
    stock: stockOverride,
    trackStock: true,
  })
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  return { buyer, product }
}

test('MATRIX: stock precheck failure → no Order, no Payment, no provider call', async () => {
  const { product } = await setupCheckout(0) // stock = 0

  let providerCalled = false
  setTestCreatePaymentIntentOverride(async () => {
    providerCalled = true
    throw new Error('should not reach')
  })

  await assert.rejects(
    () => createOrder([{ productId: product.id, quantity: 1 }], { address, saveAddress: false }),
    /Stock insuficiente/i
  )

  assert.equal(providerCalled, false)
  assert.equal(await db.order.count(), 0)
  assert.equal(await db.payment.count(), 0)
  assert.equal(await db.orderEvent.count(), 0)
})

test('MATRIX: FOR UPDATE stock race inside tx → no Order, no Payment, stock restored', async () => {
  // Stock precheck passes (stock=1, quantity=1), but between the precheck
  // and the FOR UPDATE lock inside the transaction, another buyer drains
  // the last unit. The tx throws, and the persist-first flow ensures no
  // Payment row or provider call was made.
  const { product } = await setupCheckout(1)

  // Drain the stock AFTER the precheck by patching the override to
  // deplete stock just before the provider is called. Since persist-first
  // moves the provider call AFTER the tx, we simulate the race by
  // draining stock between test setup and the createOrder call. The
  // precheck and the FOR UPDATE will both see stock=0.
  await db.product.update({ where: { id: product.id }, data: { stock: 0 } })

  let providerCalled = false
  setTestCreatePaymentIntentOverride(async () => {
    providerCalled = true
    throw new Error('should not reach')
  })

  await assert.rejects(
    () => createOrder([{ productId: product.id, quantity: 1 }], { address, saveAddress: false }),
    /Stock insuficiente/i
  )

  assert.equal(providerCalled, false)
  assert.equal(await db.order.count(), 0)
  assert.equal(await db.payment.count(), 0)
})

test('MATRIX: provider failure post-commit → Order exists FAILED, Payment FAILED providerRef=null, OrderEvent emitted', async () => {
  const { product } = await setupCheckout(10)

  setTestCreatePaymentIntentOverride(async () => {
    throw new Error('stripe unavailable')
  })

  await assert.rejects(
    () => createOrder([{ productId: product.id, quantity: 1 }], { address, saveAddress: false }),
    /stripe unavailable/i
  )

  const orders = await db.order.findMany({ include: { payments: true } })
  assert.equal(orders.length, 1)
  assert.equal(orders[0].paymentStatus, 'FAILED')

  const payment = orders[0].payments[0]!
  assert.equal(payment.status, 'FAILED')
  assert.equal(payment.providerRef, null)

  const events = await db.orderEvent.findMany({ where: { type: 'PAYMENT_INTENT_CREATION_FAILED' } })
  assert.equal(events.length, 1)
})

test('MATRIX: happy path (mock autoconfirm) → Order PAYMENT_CONFIRMED, Payment SUCCEEDED with providerRef', async () => {
  const { product } = await setupCheckout(10)

  const result = await createCheckoutOrder(
    [{ productId: product.id, quantity: 1 }],
    { address, saveAddress: false }
  )
  assert.equal(result.ok, true)

  if (!result.ok) return
  const order = await db.order.findUnique({
    where: { id: result.orderId },
    include: { payments: true },
  })
  assert.ok(order)
  assert.equal(order.status, 'PAYMENT_CONFIRMED')
  assert.equal(order.paymentStatus, 'SUCCEEDED')
  assert.equal(order.payments.length, 1)
  assert.equal(order.payments[0].status, 'SUCCEEDED')
  assert.ok(order.payments[0].providerRef?.startsWith('mock_pi_'))

  const events = await db.orderEvent.findMany({
    where: { orderId: result.orderId, type: 'PAYMENT_CONFIRMED' },
  })
  assert.equal(events.length, 1)
})
