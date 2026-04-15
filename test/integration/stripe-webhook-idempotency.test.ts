import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { POST } from '@/app/api/webhooks/stripe/route'
import { db } from '@/lib/db'
import { resetServerEnvCache } from '@/lib/env'
import { createUser, resetIntegrationDatabase } from './helpers'

beforeEach(async () => {
  await resetIntegrationDatabase()

  Object.assign(process.env, {
    DATABASE_URL:
      process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/marketplace',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    PAYMENT_PROVIDER: 'mock',
  })
  resetServerEnvCache()
})

afterEach(() => {
  resetServerEnvCache()
})

type Fixture = {
  orderId: string
  providerRef: string
  amountCents: number
  currency: string
}

async function createPendingOrderWithPayment(amountEuros = 42.5): Promise<Fixture> {
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
  const providerRef = `pi_${randomUUID().slice(0, 8)}`
  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      provider: 'stripe',
      providerRef,
      amount: amountEuros,
      currency: 'EUR',
      status: 'PENDING',
    },
  })
  return {
    orderId: order.id,
    providerRef,
    amountCents: Math.round(Number(payment.amount) * 100),
    currency: payment.currency,
  }
}

function buildPaymentSucceededRequest(
  eventId: string,
  fixture: Pick<Fixture, 'providerRef' | 'amountCents' | 'currency'>
): Request {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: eventId,
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: fixture.providerRef,
          amount: fixture.amountCents,
          currency: fixture.currency,
        },
      },
    }),
  })
}

async function countOrderEventsForStripeEventId(eventId: string): Promise<number> {
  return db.orderEvent.count({
    where: { payload: { path: ['eventId'], equals: eventId } },
  })
}

test('payment_intent.succeeded transitions the order exactly once', async () => {
  const fixture = await createPendingOrderWithPayment()
  const eventId = `evt_test_${Date.now()}_once`

  const response = await POST(buildPaymentSucceededRequest(eventId, fixture) as any)
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body, { received: true })

  const updated = await db.order.findUnique({
    where: { id: fixture.orderId },
    include: { payments: true, events: true },
  })
  assert.equal(updated?.status, 'PAYMENT_CONFIRMED')
  assert.equal(updated?.paymentStatus, 'SUCCEEDED')
  assert.equal(updated?.payments[0]?.status, 'SUCCEEDED')

  const confirmedEvents = updated?.events.filter(e => e.type === 'PAYMENT_CONFIRMED') ?? []
  assert.equal(confirmedEvents.length, 1)

  assert.equal(await countOrderEventsForStripeEventId(eventId), 1)
})

test('replayed event.id is a no-op', async () => {
  const fixture = await createPendingOrderWithPayment()
  const eventId = `evt_test_${Date.now()}_replay`

  const first = await POST(buildPaymentSucceededRequest(eventId, fixture) as any)
  assert.equal(first.status, 200)
  assert.deepEqual(await first.json(), { received: true })

  const afterFirst = await db.order.findUnique({ where: { id: fixture.orderId } })
  assert.equal(afterFirst?.status, 'PAYMENT_CONFIRMED')
  assert.equal(afterFirst?.paymentStatus, 'SUCCEEDED')
  const firstUpdatedAt = afterFirst?.updatedAt

  for (let i = 0; i < 2; i++) {
    const replay = await POST(buildPaymentSucceededRequest(eventId, fixture) as any)
    assert.equal(replay.status, 200)
    assert.deepEqual(await replay.json(), { received: true, skipped: 'duplicate' })
  }

  const afterReplays = await db.order.findUnique({
    where: { id: fixture.orderId },
    include: { events: true },
  })
  assert.equal(afterReplays?.status, 'PAYMENT_CONFIRMED')
  assert.equal(afterReplays?.paymentStatus, 'SUCCEEDED')
  // Order row was not touched again by the replays.
  assert.equal(afterReplays?.updatedAt.getTime(), firstUpdatedAt?.getTime())

  const confirmedEvents =
    afterReplays?.events.filter(e => e.type === 'PAYMENT_CONFIRMED') ?? []
  assert.equal(confirmedEvents.length, 1)

  assert.equal(await countOrderEventsForStripeEventId(eventId), 1)
})

test('different event.id targeting an already-confirmed order is a no-op transition', async () => {
  const fixture = await createPendingOrderWithPayment()
  const eventIdA = `evt_test_${Date.now()}_a`
  const eventIdB = `evt_test_${Date.now()}_b`

  const first = await POST(buildPaymentSucceededRequest(eventIdA, fixture) as any)
  assert.equal(first.status, 200)

  const afterA = await db.order.findUnique({
    where: { id: fixture.orderId },
    include: { events: true },
  })
  assert.equal(afterA?.status, 'PAYMENT_CONFIRMED')
  assert.equal(afterA?.paymentStatus, 'SUCCEEDED')
  const updatedAtAfterA = afterA?.updatedAt

  const second = await POST(buildPaymentSucceededRequest(eventIdB, fixture) as any)
  assert.equal(second.status, 200)
  // Note: this is NOT the dedupe response — event.id is fresh, so the
  // handler runs end-to-end but shouldApplyPaymentSucceeded returns false
  // because the order is already PAYMENT_CONFIRMED/SUCCEEDED, so no
  // OrderEvent is written and no fields are touched.
  assert.deepEqual(await second.json(), { received: true })

  const afterB = await db.order.findUnique({
    where: { id: fixture.orderId },
    include: { payments: true, events: true },
  })
  assert.equal(afterB?.status, 'PAYMENT_CONFIRMED')
  assert.equal(afterB?.paymentStatus, 'SUCCEEDED')
  assert.equal(afterB?.payments[0]?.status, 'SUCCEEDED')
  // Order row untouched by the second event.
  assert.equal(afterB?.updatedAt.getTime(), updatedAtAfterA?.getTime())

  const confirmedEvents = afterB?.events.filter(e => e.type === 'PAYMENT_CONFIRMED') ?? []
  assert.equal(confirmedEvents.length, 1)

  // Event B never produced an OrderEvent row at all.
  assert.equal(await countOrderEventsForStripeEventId(eventIdB), 0)
  assert.equal(await countOrderEventsForStripeEventId(eventIdA), 1)
})
