import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { POST as POST_RESOLVE } from '@/app/api/admin/incidents/[id]/resolve/route'
import { setTestRefundPaymentIntentOverride } from '@/domains/payments/provider'
import { db } from '@/lib/db'
import {
  buildSession,
  clearTestSession,
  createUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

/**
 * Admin `resolveIncident` + Stripe refund integration (#269).
 * Covers the happy path, mock mode, Stripe failure rollback,
 * over-refund rejection, and the fundedBy-required guard.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
  Object.assign(process.env, { NODE_ENV: 'test' })
})

afterEach(() => {
  clearTestSession()
  setTestRefundPaymentIntentOverride(undefined)
})

async function seedIncidentWithPaidOrder(opts: { amount?: number; providerRef?: string } = {}) {
  const buyer = await createUser('CUSTOMER')
  const admin = await db.user.create({
    data: {
      email: `admin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
      firstName: 'A',
      lastName: 'T',
      role: 'SUPERADMIN',
      isActive: true,
    },
  })

  const amount = opts.amount ?? 25
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId: buyer.id,
      status: 'DELIVERED',
      paymentStatus: 'SUCCEEDED',
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
      status: 'SUCCEEDED',
      provider: 'stripe',
      providerRef: opts.providerRef ?? `pi_test_${Math.random().toString(36).slice(2, 10)}`,
    },
  })
  const incident = await db.incident.create({
    data: {
      orderId: order.id,
      customerId: buyer.id,
      type: 'WRONG_ITEM',
      description: 'Wrong item',
      status: 'OPEN',
      slaDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000),
    },
  })
  return { buyer, admin, order, payment, incident }
}

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('resolveIncident with refundAmount>0 in stripe mode issues the refund and persists the row', async () => {
  const { admin, incident, payment } = await seedIncidentWithPaidOrder()
  let refundCallPi: string | null = null
  let refundCallAmount: number | null = null
  setTestRefundPaymentIntentOverride(async (pi, cents) => {
    refundCallPi = pi
    refundCallAmount = cents
    return { id: 're_test_123' }
  })

  useTestSession(buildSession(admin.id, 'SUPERADMIN'))
  const res = await POST_RESOLVE(
    jsonRequest(`http://localhost/api/admin/incidents/${incident.id}/resolve`, {
      resolution: 'REFUND_FULL',
      refundAmount: 25,
      fundedBy: 'PLATFORM',
    }),
    { params: Promise.resolve({ id: incident.id }) },
  )
  assert.equal(res.status, 200)
  assert.equal(refundCallPi, payment.providerRef)
  assert.equal(refundCallAmount, 2500)

  const resolved = await db.incident.findUnique({ where: { id: incident.id } })
  assert.equal(resolved?.status, 'RESOLVED')
  assert.equal(Number(resolved?.refundAmount), 25)
  assert.equal(resolved?.fundedBy, 'PLATFORM')

  const refunds = await db.refund.findMany({ where: { paymentId: payment.id } })
  assert.equal(refunds.length, 1)
  assert.equal(refunds[0]?.providerRef, 're_test_123')
  assert.equal(Number(refunds[0]?.amount), 25)
  assert.equal(refunds[0]?.fundedBy, 'PLATFORM')
})

test('resolveIncident rolls back when Stripe throws — incident stays OPEN, no Refund row', async () => {
  const { admin, incident, payment } = await seedIncidentWithPaidOrder()
  setTestRefundPaymentIntentOverride(async () => {
    throw new Error('Stripe: card_network_unavailable')
  })

  useTestSession(buildSession(admin.id, 'SUPERADMIN'))
  const res = await POST_RESOLVE(
    jsonRequest(`http://localhost/api/admin/incidents/${incident.id}/resolve`, {
      resolution: 'REFUND_FULL',
      refundAmount: 25,
      fundedBy: 'PLATFORM',
    }),
    { params: Promise.resolve({ id: incident.id }) },
  )
  assert.equal(res.status, 500)

  const stillOpen = await db.incident.findUnique({ where: { id: incident.id } })
  assert.equal(stillOpen?.status, 'OPEN', 'incident NOT marked resolved when Stripe fails')
  assert.equal(stillOpen?.refundAmount, null)

  const refunds = await db.refund.findMany({ where: { paymentId: payment.id } })
  assert.equal(refunds.length, 0, 'no Refund row persisted when Stripe threw')
})

test('resolveIncident rejects refundAmount > payment total', async () => {
  const { admin, incident } = await seedIncidentWithPaidOrder({ amount: 25 })
  setTestRefundPaymentIntentOverride(async () => {
    throw new Error('should not be called')
  })

  useTestSession(buildSession(admin.id, 'SUPERADMIN'))
  const res = await POST_RESOLVE(
    jsonRequest(`http://localhost/api/admin/incidents/${incident.id}/resolve`, {
      resolution: 'REFUND_FULL',
      refundAmount: 999,
      fundedBy: 'PLATFORM',
    }),
    { params: Promise.resolve({ id: incident.id }) },
  )
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.match(body.message, /supera el pago original/)

  const stillOpen = await db.incident.findUnique({ where: { id: incident.id } })
  assert.equal(stillOpen?.status, 'OPEN')
})

test('resolveIncident requires fundedBy when refundAmount > 0', async () => {
  const { admin, incident } = await seedIncidentWithPaidOrder()
  useTestSession(buildSession(admin.id, 'SUPERADMIN'))
  const res = await POST_RESOLVE(
    jsonRequest(`http://localhost/api/admin/incidents/${incident.id}/resolve`, {
      resolution: 'REFUND_FULL',
      refundAmount: 10,
    }),
    { params: Promise.resolve({ id: incident.id }) },
  )
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.match(body.message, /fundedBy es obligatorio/)
})

test('resolveIncident with refundAmount=0 closes the incident without calling Stripe', async () => {
  const { admin, incident, payment } = await seedIncidentWithPaidOrder()
  let stripeCalled = false
  setTestRefundPaymentIntentOverride(async () => {
    stripeCalled = true
    return { id: 'should-not-happen' }
  })

  useTestSession(buildSession(admin.id, 'SUPERADMIN'))
  const res = await POST_RESOLVE(
    jsonRequest(`http://localhost/api/admin/incidents/${incident.id}/resolve`, {
      resolution: 'REJECTED',
    }),
    { params: Promise.resolve({ id: incident.id }) },
  )
  assert.equal(res.status, 200)
  assert.equal(stripeCalled, false, 'Stripe refund NOT called when refundAmount omitted')

  const refunds = await db.refund.findMany({ where: { paymentId: payment.id } })
  assert.equal(refunds.length, 0)
})
