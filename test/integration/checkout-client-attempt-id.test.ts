import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createCheckoutOrder } from '@/domains/orders/actions'
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
 * #524 — the client now generates a checkoutAttemptId in the server
 * component render and passes it to createCheckoutOrder. This suite
 * verifies the full client-facing contract at the server-action level:
 *
 *   - Wrapper surfaces `replayed: true` on a re-submit with the same token
 *   - The Order count stays at 1 regardless of how many times the same
 *     token hits the action (simulates double-click, tab refresh)
 *   - Auto-confirm does NOT run on replay (would re-tick the Payment
 *     row — tested via payment status staying whatever the first call
 *     set it to)
 *   - A fresh token after a successful order creates a new Order
 *     (simulates buyer editing cart and resubmitting)
 *
 * Sibling suite `checkout-idempotency.test.ts` covers `createOrder`
 * directly. This one covers `createCheckoutOrder` — the client's
 * actual entry point.
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

async function seed(stock = 10) {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock })
  useTestSession(buildSession(customer.id, 'CUSTOMER'))
  return { customer, product }
}

test('createCheckoutOrder: same token → ok:true + replayed:true on the second call', async () => {
  const { product } = await seed()
  const attemptId = generateCheckoutAttemptId()

  const first = await createCheckoutOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false },
    { checkoutAttemptId: attemptId }
  )
  assert.equal(first.ok, true)
  if (!first.ok) throw new Error('first must succeed')
  assert.ok(!first.replayed)

  const second = await createCheckoutOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false },
    { checkoutAttemptId: attemptId }
  )
  assert.equal(second.ok, true)
  if (!second.ok) throw new Error('second must succeed (as replay)')
  assert.equal(second.replayed, true)
  assert.equal(second.orderId, first.orderId)
  assert.equal(second.orderNumber, first.orderNumber)

  const count = await db.order.count({ where: { checkoutAttemptId: attemptId } })
  assert.equal(count, 1)
})

test('createCheckoutOrder: rapid fire with same token → 1 Order, stock decremented once', async () => {
  const { product } = await seed(10)
  const attemptId = generateCheckoutAttemptId()

  const submit = () =>
    createCheckoutOrder(
      [{ productId: product.id, quantity: 1 }],
      { address: ADDRESS, saveAddress: false },
      { checkoutAttemptId: attemptId }
    )

  // 5 parallel submits with the same token. Whatever the race produces,
  // we must collapse to one Order.
  const results = await Promise.all([submit(), submit(), submit(), submit(), submit()])
  const orderIds = new Set(results.filter(r => r.ok).map(r => (r.ok ? r.orderId : null)))
  assert.equal(orderIds.size, 1, `expected 1 unique orderId, got ${orderIds.size}`)

  const count = await db.order.count({ where: { checkoutAttemptId: attemptId } })
  assert.equal(count, 1)

  // Exactly one replayed=false (winner) and ≥1 replayed=true (losers).
  const winners = results.filter(r => r.ok && !r.replayed)
  const replays = results.filter(r => r.ok && r.replayed)
  assert.equal(winners.length, 1)
  assert.equal(replays.length, 4)

  const refreshed = await db.product.findUnique({
    where: { id: product.id },
    select: { stock: true },
  })
  assert.equal(refreshed?.stock, 9, 'stock must decrement exactly once')
})

test('createCheckoutOrder: replay does NOT re-run mock auto-confirmation', async () => {
  const prev = process.env.PAYMENT_PROVIDER
  process.env.PAYMENT_PROVIDER = 'mock'
  try {
    const { product } = await seed()
    const attemptId = generateCheckoutAttemptId()

    await createCheckoutOrder(
      [{ productId: product.id, quantity: 1 }],
      { address: ADDRESS, saveAddress: false },
      { checkoutAttemptId: attemptId }
    )

    // Capture the state right after first commit.
    const orderAfterFirst = await db.order.findFirst({
      where: { checkoutAttemptId: attemptId },
      include: { payments: true },
    })
    const paymentsAfterFirst = orderAfterFirst?.payments.length ?? 0
    const paymentIdsAfterFirst = (orderAfterFirst?.payments ?? []).map(p => p.id).sort()

    // Replay.
    const second = await createCheckoutOrder(
      [{ productId: product.id, quantity: 1 }],
      { address: ADDRESS, saveAddress: false },
      { checkoutAttemptId: attemptId }
    )
    assert.ok(second.ok && second.replayed)

    const orderAfterReplay = await db.order.findFirst({
      where: { checkoutAttemptId: attemptId },
      include: { payments: true },
    })
    // Payment rows unchanged — no extra Payment created by a second
    // confirmOrder invocation.
    assert.equal(orderAfterReplay?.payments.length, paymentsAfterFirst)
    assert.deepEqual(
      (orderAfterReplay?.payments ?? []).map(p => p.id).sort(),
      paymentIdsAfterFirst
    )
  } finally {
    if (prev) process.env.PAYMENT_PROVIDER = prev
    else delete process.env.PAYMENT_PROVIDER
  }
})

test('createCheckoutOrder: a fresh token on cart resubmit creates a distinct Order', async () => {
  const { product } = await seed(10)

  const first = await createCheckoutOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false },
    { checkoutAttemptId: generateCheckoutAttemptId() }
  )
  assert.ok(first.ok)

  const second = await createCheckoutOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false },
    { checkoutAttemptId: generateCheckoutAttemptId() }
  )
  assert.ok(second.ok)
  assert.notEqual(first.ok && first.orderId, second.ok && second.orderId)

  const total = await db.order.count()
  assert.equal(total, 2)
})
