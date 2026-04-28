import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { POST } from '@/app/api/webhooks/stripe/route'
import { db } from '@/lib/db'
import { resetServerEnvCache } from '@/lib/env'
import { createUser, resetIntegrationDatabase } from './helpers'

/**
 * DB audit P0.1 (#959). Stripe does not promise event order. The
 * payment_intent webhook handlers now keep a per-Payment watermark
 * (Payment.lastStripeEventAt) and drop any event whose `event.created`
 * is older than it. Mirrors the long-standing pattern on
 * Subscription.lastStripeEventAt for invoice.* events.
 */

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

async function createPendingPayment() {
  const customer = await createUser('CUSTOMER')
  const order = await db.order.create({
    data: {
      orderNumber: `ord_${randomUUID().slice(0, 8)}`,
      customerId: customer.id,
      status: 'PLACED',
      paymentStatus: 'PENDING',
      subtotal: '42.50',
      taxAmount: '0',
      grandTotal: '42.50',
    },
  })
  const providerRef = `pi_${randomUUID().slice(0, 8)}`
  await db.payment.create({
    data: {
      orderId: order.id,
      provider: 'stripe',
      providerRef,
      amount: '42.50',
      currency: 'EUR',
      status: 'PENDING',
    },
  })
  return { orderId: order.id, providerRef }
}

function buildPaymentSucceededEvent(
  eventId: string,
  providerRef: string,
  createdEpoch: number,
): Request {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: eventId,
      type: 'payment_intent.succeeded',
      created: createdEpoch,
      data: {
        object: {
          id: providerRef,
          amount: 4250,
          currency: 'EUR',
        },
      },
    }),
  })
}

test('a stale payment_intent.succeeded (older than watermark) is dropped', async () => {
  const { orderId, providerRef } = await createPendingPayment()

  // Simulate that a newer event already advanced the watermark — e.g.
  // a charge.refunded landed first and bumped lastStripeEventAt.
  const watermark = new Date()
  await db.payment.update({
    where: { providerRef },
    data: { status: 'REFUNDED', lastStripeEventAt: watermark },
  })
  await db.order.update({
    where: { id: orderId },
    data: { status: 'REFUNDED', paymentStatus: 'REFUNDED' },
  })

  // Now a late payment_intent.succeeded arrives whose `created` is
  // older than the watermark. The handler must NOT resurrect the
  // refunded order.
  const stale = await POST(
    buildPaymentSucceededEvent(
      `evt_stale_${randomUUID().slice(0, 8)}`,
      providerRef,
      Math.floor((watermark.getTime() - 5_000) / 1000),
    ) as never,
  )
  assert.equal(stale.status, 200)

  const after = await db.order.findUnique({
    where: { id: orderId },
    include: { payments: true, events: true },
  })
  assert.equal(after?.status, 'REFUNDED')
  assert.equal(after?.paymentStatus, 'REFUNDED')
  assert.equal(after?.payments[0]?.status, 'REFUNDED')
  // No PAYMENT_CONFIRMED event should have been emitted by the stale event.
  const confirmed = after?.events.filter((e) => e.type === 'PAYMENT_CONFIRMED') ?? []
  assert.equal(confirmed.length, 0)
})

test('a fresh payment_intent.succeeded (newer than watermark) advances the watermark', async () => {
  const { orderId, providerRef } = await createPendingPayment()

  // Pre-existing watermark from a much older event.
  const oldWatermark = new Date(Date.now() - 60_000)
  await db.payment.update({
    where: { providerRef },
    data: { lastStripeEventAt: oldWatermark },
  })

  const freshCreatedEpoch = Math.floor(Date.now() / 1000)
  const fresh = await POST(
    buildPaymentSucceededEvent(
      `evt_fresh_${randomUUID().slice(0, 8)}`,
      providerRef,
      freshCreatedEpoch,
    ) as never,
  )
  assert.equal(fresh.status, 200)

  const after = await db.payment.findUnique({ where: { providerRef } })
  assert.equal(after?.status, 'SUCCEEDED')
  assert.ok(after?.lastStripeEventAt)
  assert.ok(
    after!.lastStripeEventAt!.getTime() >= freshCreatedEpoch * 1000,
    'watermark must move forward to the fresh event timestamp',
  )

  const order = await db.order.findUnique({ where: { id: orderId } })
  assert.equal(order?.status, 'PAYMENT_CONFIRMED')
})
