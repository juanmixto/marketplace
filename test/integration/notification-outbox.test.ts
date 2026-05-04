import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import {
  NOTIFICATION_OUTBOX_DELIVERED,
  NOTIFICATION_OUTBOX_PENDING,
  dispatchPendingOutboxNotifications,
  markNotificationDelivered,
  recordPendingNotification,
} from '@/domains/notifications/outbox'
import {
  clearTestSession,
  createUser,
  resetIntegrationDatabase,
} from './helpers'

/**
 * #1171 H-10 — outbox primitives + sweeper. The webhook handler writes
 * the intent row inside the same transaction as the Order/Payment
 * commit; the post-commit emit is best-effort. The sweeper picks up
 * any PENDING that lacks a DELIVERED sibling.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
  Object.assign(process.env, { NODE_ENV: 'test' })
})

afterEach(() => {
  clearTestSession()
})

async function seedConfirmedOrder() {
  const buyer = await createUser('CUSTOMER')
  const order = await db.order.create({
    data: {
      orderNumber: `OB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId: buyer.id,
      status: 'PAYMENT_CONFIRMED',
      paymentStatus: 'SUCCEEDED',
      subtotal: 25,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 25,
    },
  })
  return { buyer, order }
}

test('recordPendingNotification writes a NOTIFICATION_PENDING OrderEvent inside a tx (#1171 H-10)', async () => {
  const { buyer, order } = await seedConfirmedOrder()

  await db.$transaction(async tx => {
    await recordPendingNotification(tx, {
      orderId: order.id,
      event: 'order.buyer_confirmed',
      payload: { orderId: order.id, customerUserId: buyer.id },
    })
  })

  const events = await db.orderEvent.findMany({
    where: { orderId: order.id, type: NOTIFICATION_OUTBOX_PENDING },
  })
  assert.equal(events.length, 1)
  const payload = events[0]!.payload as { event?: string; payloadRef?: string }
  assert.equal(payload.event, 'order.buyer_confirmed')
  assert.equal(payload.payloadRef, `order.buyer_confirmed:${order.id}`)
})

test('dispatchPendingOutboxNotifications skips PENDING that already has DELIVERED (#1171 H-10)', async () => {
  const { buyer, order } = await seedConfirmedOrder()

  await db.$transaction(async tx => {
    await recordPendingNotification(tx, {
      orderId: order.id,
      event: 'order.buyer_confirmed',
      payload: { orderId: order.id, customerUserId: buyer.id },
    })
  })
  await markNotificationDelivered(db, {
    orderId: order.id,
    event: 'order.buyer_confirmed',
  })

  // Make the row "old enough" for the sweep cutoff.
  await db.orderEvent.updateMany({
    where: { orderId: order.id, type: NOTIFICATION_OUTBOX_PENDING },
    data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) },
  })

  let emitCalls = 0
  const report = await dispatchPendingOutboxNotifications({
    db,
    olderThanMinutes: 10,
    emit: (() => {
      emitCalls += 1
    }) as never,
  })

  assert.equal(report.delivered, 0, 'no re-delivery when DELIVERED row exists')
  assert.equal(report.skipped, 1)
  assert.equal(emitCalls, 0, 'emit must NOT fire when delivered sibling found')
})

test('dispatchPendingOutboxNotifications re-emits PENDING without DELIVERED and records DELIVERED (#1171 H-10)', async () => {
  const { buyer, order } = await seedConfirmedOrder()

  // Simulates a process that committed the intent row but crashed
  // before the post-commit emit could fire.
  await db.$transaction(async tx => {
    await recordPendingNotification(tx, {
      orderId: order.id,
      event: 'order.buyer_confirmed',
      payload: { orderId: order.id, customerUserId: buyer.id },
    })
  })
  await db.orderEvent.updateMany({
    where: { orderId: order.id, type: NOTIFICATION_OUTBOX_PENDING },
    data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) },
  })

  const emitted: Array<{ event: string; payload: unknown }> = []
  const report = await dispatchPendingOutboxNotifications({
    db,
    olderThanMinutes: 10,
    emit: ((event: string, payload: unknown) => {
      emitted.push({ event, payload })
    }) as never,
  })

  assert.equal(report.delivered, 1)
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0]!.event, 'order.buyer_confirmed')

  const deliveredRows = await db.orderEvent.findMany({
    where: { orderId: order.id, type: NOTIFICATION_OUTBOX_DELIVERED },
  })
  assert.equal(deliveredRows.length, 1, 'sweep persisted DELIVERED row')

  // Re-running must be idempotent.
  const second = await dispatchPendingOutboxNotifications({
    db,
    olderThanMinutes: 10,
    emit: ((event: string, payload: unknown) => {
      emitted.push({ event, payload })
    }) as never,
  })
  assert.equal(second.delivered, 0)
  assert.equal(emitted.length, 1, 'no double emit on re-run')
})

test('dispatchPendingOutboxNotifications respects the cutoff window (#1171 H-10)', async () => {
  const { buyer, order } = await seedConfirmedOrder()

  await db.$transaction(async tx => {
    await recordPendingNotification(tx, {
      orderId: order.id,
      event: 'order.buyer_confirmed',
      payload: { orderId: order.id, customerUserId: buyer.id },
    })
  })
  // Row is fresh (created right now). Sweep with 10-min cutoff should skip.

  const report = await dispatchPendingOutboxNotifications({
    db,
    olderThanMinutes: 10,
    emit: (() => {
      throw new Error('emit must not fire on too-young rows')
    }) as never,
  })
  assert.equal(report.reviewed, 0)
})

test('sweep counts emit failures into errors, leaves PENDING for next run (#1171 H-10)', async () => {
  const { buyer, order } = await seedConfirmedOrder()

  await db.$transaction(async tx => {
    await recordPendingNotification(tx, {
      orderId: order.id,
      event: 'order.buyer_confirmed',
      payload: { orderId: order.id, customerUserId: buyer.id },
    })
  })
  await db.orderEvent.updateMany({
    where: { orderId: order.id, type: NOTIFICATION_OUTBOX_PENDING },
    data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) },
  })

  const report = await dispatchPendingOutboxNotifications({
    db,
    olderThanMinutes: 10,
    emit: (() => {
      throw new Error('handler down')
    }) as never,
  })

  assert.equal(report.errors, 1)
  assert.equal(report.delivered, 0)
  const deliveredRows = await db.orderEvent.findMany({
    where: { orderId: order.id, type: NOTIFICATION_OUTBOX_DELIVERED },
  })
  assert.equal(deliveredRows.length, 0, 'no DELIVERED row when emit throws')
})
