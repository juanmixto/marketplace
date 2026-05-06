import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { resetIntegrationDatabase } from './helpers'

/**
 * DB audit P0.2 (#960): Refund.providerRef must be UNIQUE so that a replayed
 * `charge.refunded` (e.g. from the dead-letter queue, an admin script, or any
 * non-WebhookDelivery code path) cannot insert the same Stripe refund twice.
 *
 * A second-layer guard on top of WebhookDelivery — important because Refund
 * inserts can originate outside the webhook handler.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

test('Refund.providerRef rejects duplicates with P2002', async () => {
  // Create a minimal Order + Payment to satisfy Refund's FK to Payment.
  const customer = await db.user.create({
    data: {
      email: `refund-test-${Date.now()}@example.com`,
      firstName: 'Refund',
      lastName: 'Test',
    },
  })
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-RF-${Date.now()}`,
      customerId: customer.id,
      status: 'PLACED',
      paymentStatus: 'SUCCEEDED',
      subtotal: '10.00',
      taxAmount: '1.00',
      grandTotal: '11.00',
    },
  })
  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      provider: 'stripe',
      providerRef: `pi_test_${Date.now()}`,
      amount: '11.00',
      status: 'SUCCEEDED',
    },
  })

  const providerRef = `re_dup_${Date.now()}`
  await db.refund.create({
    data: {
      paymentId: payment.id,
      amount: '5.00',
      reason: 'requested_by_customer',
      fundedBy: 'PLATFORM',
      providerRef,
    },
  })

  await assert.rejects(
    () =>
      db.refund.create({
        data: {
          paymentId: payment.id,
          amount: '5.00',
          reason: 'requested_by_customer',
          fundedBy: 'PLATFORM',
          providerRef,
        },
      }),
    (err: { code?: string }) => err.code === 'P2002',
  )

  const count = await db.refund.count({ where: { providerRef } })
  assert.equal(count, 1, 'exactly one Refund row should exist for the providerRef')
})

test('Refund.providerRef allows multiple NULL values (Postgres UNIQUE semantics)', async () => {
  const customer = await db.user.create({
    data: {
      email: `refund-null-${Date.now()}@example.com`,
      firstName: 'Refund',
      lastName: 'Null',
    },
  })
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-RFN-${Date.now()}`,
      customerId: customer.id,
      status: 'PLACED',
      paymentStatus: 'SUCCEEDED',
      subtotal: '10.00',
      taxAmount: '1.00',
      grandTotal: '11.00',
    },
  })
  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      provider: 'stripe',
      providerRef: `pi_test_null_${Date.now()}`,
      amount: '11.00',
      status: 'SUCCEEDED',
    },
  })

  await db.refund.create({
    data: {
      paymentId: payment.id,
      amount: '1.00',
      reason: 'manual',
      fundedBy: 'PLATFORM',
      providerRef: null,
    },
  })
  await db.refund.create({
    data: {
      paymentId: payment.id,
      amount: '1.00',
      reason: 'manual',
      fundedBy: 'PLATFORM',
      providerRef: null,
    },
  })

  const count = await db.refund.count({ where: { paymentId: payment.id } })
  assert.equal(count, 2, 'two NULL providerRef rows must coexist')
})
