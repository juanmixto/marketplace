import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { cancelOrderWithRefundPolicy } from '@/domains/orders/use-cases/cancel-order'
import { setTestRefundPaymentIntentOverride } from '@/domains/payments/provider'
import {
  clearTestSession,
  createUser,
  resetIntegrationDatabase,
} from './helpers'

beforeEach(async () => {
  await resetIntegrationDatabase()
  Object.assign(process.env, { NODE_ENV: 'test' })
})

afterEach(() => {
  clearTestSession()
  setTestRefundPaymentIntentOverride(undefined)
})

async function seedOrder(opts: {
  status: 'PLACED' | 'PAYMENT_CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'CANCELLED' | 'REFUNDED'
  paymentStatus?: 'PENDING' | 'SUCCEEDED' | 'REFUNDED'
  withProviderRef?: boolean
  amount?: number
}) {
  const buyer = await createUser('CUSTOMER')
  const admin = await createUser('SUPERADMIN')
  const amount = opts.amount ?? 25
  const paymentStatus = opts.paymentStatus ?? (opts.status === 'PLACED' ? 'PENDING' : 'SUCCEEDED')

  const order = await db.order.create({
    data: {
      orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId: buyer.id,
      status: opts.status,
      paymentStatus,
      subtotal: amount,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: amount,
    },
  })
  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      amount,
      currency: 'eur',
      status: paymentStatus === 'SUCCEEDED' ? 'SUCCEEDED' : paymentStatus === 'REFUNDED' ? 'REFUNDED' : 'PENDING',
      provider: 'stripe',
      providerRef: opts.withProviderRef === false ? null : `pi_test_${Math.random().toString(36).slice(2, 10)}`,
    },
  })
  return { buyer, admin, order, payment }
}

test('pre-payment cancel (Order PLACED, payment PENDING) — no Refund row, Order CANCELLED', async () => {
  const { admin, order } = await seedOrder({ status: 'PLACED' })
  let stripeCalled = false
  setTestRefundPaymentIntentOverride(async () => {
    stripeCalled = true
    return { id: 'should_not_happen' }
  })

  const result = await cancelOrderWithRefundPolicy({
    orderId: order.id,
    reason: 'buyer changed mind',
    actor: { type: 'ADMIN', id: admin.id },
  })
  assert.equal(result.refundIssued, false)
  assert.equal(stripeCalled, false)

  const refreshed = await db.order.findUnique({ where: { id: order.id } })
  assert.equal(refreshed?.status, 'CANCELLED')
  const refunds = await db.refund.findMany({ where: { paymentId: { not: undefined } } })
  assert.equal(refunds.length, 0)

  const cancelEvent = await db.orderEvent.findFirst({
    where: { orderId: order.id, type: 'ORDER_CANCELLED' },
  })
  assert.ok(cancelEvent, 'ORDER_CANCELLED OrderEvent must be persisted')
})

test('post-payment cancel (PAYMENT_CONFIRMED, payment SUCCEEDED) — issues full refund, Order REFUNDED', async () => {
  const { admin, order, payment } = await seedOrder({ status: 'PAYMENT_CONFIRMED' })
  let refundCallPi: string | null = null
  let refundCallCents: number | null = null
  setTestRefundPaymentIntentOverride(async (pi, cents) => {
    refundCallPi = pi
    refundCallCents = cents
    return { id: 're_test_full_cancel' }
  })

  const result = await cancelOrderWithRefundPolicy({
    orderId: order.id,
    reason: 'buyer remorse',
    actor: { type: 'ADMIN', id: admin.id },
  })
  assert.equal(result.refundIssued, true)
  assert.equal(refundCallPi, payment.providerRef)
  assert.equal(refundCallCents, 2500)

  const refreshedOrder = await db.order.findUnique({ where: { id: order.id } })
  assert.equal(refreshedOrder?.status, 'REFUNDED')
  assert.equal(refreshedOrder?.paymentStatus, 'REFUNDED')

  const refreshedPayment = await db.payment.findUnique({ where: { id: payment.id } })
  assert.equal(refreshedPayment?.status, 'REFUNDED')

  const refunds = await db.refund.findMany({ where: { paymentId: payment.id } })
  assert.equal(refunds.length, 1)
  assert.equal(refunds[0]?.providerRef, 're_test_full_cancel')
  assert.equal(Number(refunds[0]?.amount), 25)

  const refundEvent = await db.orderEvent.findFirst({
    where: { orderId: order.id, type: 'REFUND_ISSUED' },
  })
  assert.ok(refundEvent, 'REFUND_ISSUED OrderEvent must be persisted')
})

test('cancel of SHIPPED order throws cancellation_requires_incident', async () => {
  const { admin, order } = await seedOrder({ status: 'SHIPPED' })
  setTestRefundPaymentIntentOverride(async () => {
    throw new Error('should_not_be_called')
  })

  await assert.rejects(
    () =>
      cancelOrderWithRefundPolicy({
        orderId: order.id,
        reason: 'too late',
        actor: { type: 'ADMIN', id: admin.id },
      }),
    /cancellation_requires_incident/,
  )

  const refreshed = await db.order.findUnique({ where: { id: order.id } })
  assert.equal(refreshed?.status, 'SHIPPED')
})

test('idempotent: double cancel on terminal state returns alreadyTerminal and does not re-fire Stripe', async () => {
  const { admin, order } = await seedOrder({ status: 'CANCELLED', paymentStatus: 'PENDING' })
  let stripeCalls = 0
  setTestRefundPaymentIntentOverride(async () => {
    stripeCalls += 1
    return { id: 'noop' }
  })

  const r1 = await cancelOrderWithRefundPolicy({
    orderId: order.id,
    reason: 'retry',
    actor: { type: 'ADMIN', id: admin.id },
  })
  const r2 = await cancelOrderWithRefundPolicy({
    orderId: order.id,
    reason: 'retry again',
    actor: { type: 'ADMIN', id: admin.id },
  })
  assert.deepEqual(r1, { refundIssued: false, alreadyTerminal: 'CANCELLED' })
  assert.deepEqual(r2, { refundIssued: false, alreadyTerminal: 'CANCELLED' })
  assert.equal(stripeCalls, 0)
})

test('idempotent: REFUNDED order returns alreadyTerminal: REFUNDED', async () => {
  const { admin, order } = await seedOrder({ status: 'REFUNDED', paymentStatus: 'REFUNDED' })

  const result = await cancelOrderWithRefundPolicy({
    orderId: order.id,
    reason: 'retry',
    actor: { type: 'ADMIN', id: admin.id },
  })
  assert.deepEqual(result, { refundIssued: false, alreadyTerminal: 'REFUNDED' })
})

test('buyer cancel post-PROCESSING is rejected (admin-only)', async () => {
  const { buyer, order } = await seedOrder({ status: 'PROCESSING' })
  setTestRefundPaymentIntentOverride(async () => ({ id: 'should_not_happen' }))

  await assert.rejects(
    () =>
      cancelOrderWithRefundPolicy({
        orderId: order.id,
        reason: 'too late buyer',
        actor: { type: 'BUYER', id: buyer.id },
      }),
    /cancellation_admin_only/,
  )
})

test('buyer cancel of someone else order is forbidden', async () => {
  const otherBuyer = await createUser('CUSTOMER')
  const { order } = await seedOrder({ status: 'PLACED' })

  await assert.rejects(
    () =>
      cancelOrderWithRefundPolicy({
        orderId: order.id,
        reason: 'not yours',
        actor: { type: 'BUYER', id: otherBuyer.id },
      }),
    /forbidden/,
  )
})

test('buyer cancel of own PLACED order succeeds (no Stripe call)', async () => {
  const { buyer, order } = await seedOrder({ status: 'PLACED' })
  let stripeCalled = false
  setTestRefundPaymentIntentOverride(async () => {
    stripeCalled = true
    return { id: 'noop' }
  })

  const result = await cancelOrderWithRefundPolicy({
    orderId: order.id,
    reason: 'cambio de opinión',
    actor: { type: 'BUYER', id: buyer.id },
  })
  assert.equal(result.refundIssued, false)
  assert.equal(stripeCalled, false)

  const refreshed = await db.order.findUnique({ where: { id: order.id } })
  assert.equal(refreshed?.status, 'CANCELLED')
})

test('Stripe failure leaves Order untouched (no Refund, no status change)', async () => {
  const { admin, order } = await seedOrder({ status: 'PAYMENT_CONFIRMED' })
  setTestRefundPaymentIntentOverride(async () => {
    throw new Error('stripe_unreachable')
  })

  await assert.rejects(
    () =>
      cancelOrderWithRefundPolicy({
        orderId: order.id,
        reason: 'retry later',
        actor: { type: 'ADMIN', id: admin.id },
      }),
    /stripe_unreachable/,
  )

  const refreshed = await db.order.findUnique({ where: { id: order.id } })
  assert.equal(refreshed?.status, 'PAYMENT_CONFIRMED', 'Order kept its previous status')
  const refunds = await db.refund.findMany({})
  assert.equal(refunds.length, 0)
})
