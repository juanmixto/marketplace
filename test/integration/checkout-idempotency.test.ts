import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createOrder, createCheckoutOrder } from '@/domains/orders/actions'
import { generateCheckoutAttemptId } from '@/domains/orders/checkout-token'
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
 * Integration coverage for #410/#411/#412 — the checkout dedupe contract.
 *
 * What we pin:
 *
 *   1. **Sequential retry:** same checkoutAttemptId after a successful
 *      first call returns the existing Order with `replayed: true`.
 *
 *   2. **Concurrent double-submit:** two createOrder calls with the same
 *      attemptId kicked off in parallel produce ONE Order. Both callers
 *      resolve to the same orderId; one sees `replayed: false` (winner),
 *      the other sees `replayed: true` (collided on UNIQUE constraint).
 *
 *   3. **Cross-user attempt-id reuse:** buyer B presenting buyer A's
 *      attemptId is rejected, never leaks A's order.
 *
 *   4. **Fresh tokens don't interfere:** distinct attemptIds in the
 *      same session create distinct orders.
 *
 *   5. **Opt-in semantics:** omitting checkoutAttemptId preserves
 *      pre-#410 behaviour (no dedupe, every call creates a new order).
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

const ADDRESS = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  line1: 'Calle Mayor 1',
  city: 'Madrid',
  province: 'Madrid',
  postalCode: '28001',
}

async function seedBuyerAndProduct(stock = 10) {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))
  return { customer, product }
}

// ── 1. Sequential retry ──────────────────────────────────────────────────

test('createOrder: sequential retry with same checkoutAttemptId returns replayed: true', async () => {
  const { product } = await seedBuyerAndProduct()
  const attemptId = generateCheckoutAttemptId()

  const first = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false },
    { checkoutAttemptId: attemptId }
  )
  assert.equal(first.replayed, false)

  const second = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false },
    { checkoutAttemptId: attemptId }
  )
  assert.equal(second.replayed, true)
  assert.equal(second.orderId, first.orderId)
  assert.equal(second.orderNumber, first.orderNumber)

  // Exactly one Order exists for this attempt.
  const count = await db.order.count({ where: { checkoutAttemptId: attemptId } })
  assert.equal(count, 1)

  // Stock decremented exactly once (not twice).
  const refreshed = await db.product.findUnique({
    where: { id: product.id },
    select: { stock: true },
  })
  assert.equal(refreshed?.stock, 9)
})

// ── 2. Concurrent double-submit ─────────────────────────────────────────

test('createOrder: concurrent double-submit with same attemptId collapses to a single Order', async () => {
  const { product } = await seedBuyerAndProduct()
  const attemptId = generateCheckoutAttemptId()

  const payload = () =>
    createOrder(
      [{ productId: product.id, quantity: 1 }],
      { address: ADDRESS, saveAddress: false },
      { checkoutAttemptId: attemptId }
    )

  const [a, b] = await Promise.all([payload(), payload()])

  assert.equal(a.orderId, b.orderId, 'both callers must resolve to the same orderId')
  assert.equal(a.orderNumber, b.orderNumber)

  // Exactly one of the two should report replayed=true; the winner false.
  const replayedFlags = [a.replayed, b.replayed].sort()
  assert.deepEqual(replayedFlags, [false, true])

  const count = await db.order.count({ where: { checkoutAttemptId: attemptId } })
  assert.equal(count, 1)

  const refreshed = await db.product.findUnique({
    where: { id: product.id },
    select: { stock: true },
  })
  assert.equal(refreshed?.stock, 9, 'stock must decrement exactly once')
})

// ── 3. Cross-user attempt-id reuse ──────────────────────────────────────

test('createOrder: buyer B cannot reuse buyer A checkoutAttemptId', async () => {
  const { customer: buyerA, product } = await seedBuyerAndProduct()
  const attemptId = generateCheckoutAttemptId()
  await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false },
    { checkoutAttemptId: attemptId }
  )

  const buyerB = await createUser('CUSTOMER')
  useTestSession(buildSession(buyerB.id, 'CUSTOMER'))

  await assert.rejects(
    () =>
      createOrder(
        [{ productId: product.id, quantity: 1 }],
        { address: ADDRESS, saveAddress: false },
        { checkoutAttemptId: attemptId }
      ),
    /checkout inv[aá]lida|Sesi[oó]n de checkout/i
  )

  // Only buyer A's Order exists.
  const count = await db.order.count({
    where: { checkoutAttemptId: attemptId, customerId: buyerA.id },
  })
  assert.equal(count, 1)
  // Buyer B has no Order attached to this attemptId.
  const bCount = await db.order.count({
    where: { checkoutAttemptId: attemptId, customerId: buyerB.id },
  })
  assert.equal(bCount, 0)
})

// ── 4. Fresh tokens don't interfere ──────────────────────────────────────

test('createOrder: distinct checkoutAttemptIds in the same session create distinct orders', async () => {
  const { product } = await seedBuyerAndProduct()

  const first = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false },
    { checkoutAttemptId: generateCheckoutAttemptId() }
  )
  const second = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false },
    { checkoutAttemptId: generateCheckoutAttemptId() }
  )

  assert.notEqual(first.orderId, second.orderId)
  assert.equal(first.replayed, false)
  assert.equal(second.replayed, false)

  const total = await db.order.count()
  assert.equal(total, 2)
})

// ── 5. Opt-in semantics ──────────────────────────────────────────────────

test('createOrder: omitting checkoutAttemptId preserves pre-#410 behaviour (no dedupe)', async () => {
  const { product } = await seedBuyerAndProduct()

  const first = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false }
  )
  const second = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false }
  )

  assert.notEqual(first.orderId, second.orderId)
  assert.equal(first.replayed, false)
  assert.equal(second.replayed, false)
})

// ── 6. Wrapper surfaces replayed flag ────────────────────────────────────

test('createCheckoutOrder: surfaces replayed flag to the client', async () => {
  const { product } = await seedBuyerAndProduct()
  const attemptId = generateCheckoutAttemptId()

  const first = await createCheckoutOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false },
    { checkoutAttemptId: attemptId }
  )
  assert.equal(first.ok, true)
  if (first.ok) assert.ok(first.replayed === undefined || first.replayed === false)

  const second = await createCheckoutOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false },
    { checkoutAttemptId: attemptId }
  )
  assert.equal(second.ok, true)
  if (second.ok) {
    assert.equal(second.replayed, true)
    assert.equal(second.orderId, first.ok ? first.orderId : '')
  }
})
