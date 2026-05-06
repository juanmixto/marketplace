import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import {
  recordOrderEvent,
  OrderEventActorRequiredError,
  ACTOR_REQUIRED_ORDER_EVENT_TYPES,
} from '@/domains/orders'
import { resetIntegrationDatabase, createUser } from './helpers'

/**
 * Issue #1356 (epic #1346 — PII pre-launch).
 *
 * `OrderEvent.actorId` is nullable at the schema level (system events
 * legitimately have no actor — Stripe webhooks, automatic transitions),
 * but **admin-mutating** events (`REFUND_ISSUED`, `ORDER_CANCELLED`)
 * MUST carry an actor or a forensic "who issued this refund?" has no
 * answer. `recordOrderEvent` is the sanctioned writer that enforces
 * this contract; this suite exercises every actor-required type plus
 * the happy path for a system event.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

async function createOrder(customerId: string) {
  return db.order.create({
    data: {
      orderNumber: `ORD-1356-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId,
      status: 'PLACED',
      paymentStatus: 'PENDING',
      subtotal: '10.00',
      taxAmount: '0',
      grandTotal: '10.00',
    },
  })
}

test('recordOrderEvent rejects REFUND_ISSUED without actorId', async () => {
  const customer = await createUser('CUSTOMER')
  const order = await createOrder(customer.id)

  await assert.rejects(
    () =>
      recordOrderEvent({
        client: db,
        orderId: order.id,
        type: 'REFUND_ISSUED',
        actorId: null,
        payload: { amount: 10 },
      }),
    (err: unknown) => err instanceof OrderEventActorRequiredError,
  )

  assert.equal(await db.orderEvent.count({ where: { orderId: order.id } }), 0)
})

test('recordOrderEvent rejects ORDER_CANCELLED without actorId', async () => {
  const customer = await createUser('CUSTOMER')
  const order = await createOrder(customer.id)

  await assert.rejects(
    () =>
      recordOrderEvent({
        client: db,
        orderId: order.id,
        type: 'ORDER_CANCELLED',
        actorId: null,
        payload: { reason: 'test' },
      }),
    (err: unknown) => err instanceof OrderEventActorRequiredError,
  )
})

test('recordOrderEvent rejects empty-string actorId for actor-required types', async () => {
  const customer = await createUser('CUSTOMER')
  const order = await createOrder(customer.id)

  await assert.rejects(
    () =>
      recordOrderEvent({
        client: db,
        orderId: order.id,
        type: 'REFUND_ISSUED',
        actorId: '',
      }),
    (err: unknown) => err instanceof OrderEventActorRequiredError,
  )
})

test('recordOrderEvent persists actor-required event when actorId is set', async () => {
  const customer = await createUser('CUSTOMER')
  const admin = await createUser('ADMIN_FINANCE')
  const order = await createOrder(customer.id)

  await recordOrderEvent({
    client: db,
    orderId: order.id,
    type: 'REFUND_ISSUED',
    actorId: admin.id,
    payload: { amount: 10, reason: 'incident' },
  })

  const events = await db.orderEvent.findMany({ where: { orderId: order.id } })
  assert.equal(events.length, 1)
  assert.equal(events[0]?.type, 'REFUND_ISSUED')
  assert.equal(events[0]?.actorId, admin.id)
})

test('recordOrderEvent allows system events (PAYMENT_CONFIRMED) with null actorId', async () => {
  const customer = await createUser('CUSTOMER')
  const order = await createOrder(customer.id)

  await recordOrderEvent({
    client: db,
    orderId: order.id,
    type: 'PAYMENT_CONFIRMED',
    actorId: null,
    payload: { providerRef: 'pi_test_123' },
  })

  const events = await db.orderEvent.findMany({ where: { orderId: order.id } })
  assert.equal(events.length, 1)
  assert.equal(events[0]?.actorId, null)
})

test('ACTOR_REQUIRED_ORDER_EVENT_TYPES is the contract — current set covers refund + cancel', () => {
  assert.ok(ACTOR_REQUIRED_ORDER_EVENT_TYPES.has('REFUND_ISSUED'))
  assert.ok(ACTOR_REQUIRED_ORDER_EVENT_TYPES.has('ORDER_CANCELLED'))
  assert.ok(!ACTOR_REQUIRED_ORDER_EVENT_TYPES.has('PAYMENT_CONFIRMED'))
})
