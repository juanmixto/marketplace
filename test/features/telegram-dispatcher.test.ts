import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  on,
  emit,
  clearHandlersForTest,
  waitForPendingNotifications,
} from '@/domains/notifications/dispatcher'

// Serialize subtests: the dispatcher keeps handlers in `globalThis` (HMR
// safety in dev) and `emit()` is async (dynamic import bootstrap). Without
// serialisation a sibling test's `clearHandlersForTest()` can wipe handlers
// while the previous test's emit is still in flight, and microtask waits
// like `setImmediate` race the dynamic import. Serialising + draining via
// `waitForPendingNotifications()` removes both races.
describe('telegram dispatcher', { concurrency: false }, () => {

test('dispatcher delivers typed payloads to handlers', async () => {
  clearHandlersForTest()
  const received: Array<{ orderId: string }> = []
  on('order.created', async payload => {
    received.push({ orderId: payload.orderId })
  })

  emit('order.created', {
    orderId: 'ord_1',
    vendorId: 'vnd_1',
    customerName: 'Alice',
    totalCents: 1500,
    currency: 'EUR',
  })

  await waitForPendingNotifications()

  assert.deepEqual(received, [{ orderId: 'ord_1' }])
})

test('dispatcher silently drops invalid payloads', async () => {
  clearHandlersForTest()
  let called = false
  on('order.created', async () => {
    called = true
  })

  emit('order.created', {
    orderId: '',
    vendorId: '',
    customerName: '',
    totalCents: -1,
    currency: 'XX',
  } as never)

  await waitForPendingNotifications()

  assert.equal(called, false, 'invalid payload must not reach handlers')
})

test('handler error does not propagate to emitter', async () => {
  clearHandlersForTest()
  on('order.created', async () => {
    throw new Error('boom')
  })

  let emitterThrew = false
  try {
    emit('order.created', {
      orderId: 'ord_2',
      vendorId: 'vnd_2',
      customerName: 'Bob',
      totalCents: 500,
      currency: 'EUR',
    })
  } catch {
    emitterThrew = true
  }
  assert.equal(emitterThrew, false, 'emit() is fire-and-forget; handler throw must not surface')

  await waitForPendingNotifications()
})

test('unsubscribe removes a handler', async () => {
  clearHandlersForTest()
  let count = 0
  const unsub = on('order.created', async () => {
    count++
  })

  emit('order.created', {
    orderId: 'ord_3',
    vendorId: 'vnd_3',
    customerName: 'Carol',
    totalCents: 200,
    currency: 'EUR',
  })
  await waitForPendingNotifications()
  assert.equal(count, 1)

  unsub()

  emit('order.created', {
    orderId: 'ord_4',
    vendorId: 'vnd_3',
    customerName: 'Carol',
    totalCents: 200,
    currency: 'EUR',
  })
  await waitForPendingNotifications()
  assert.equal(count, 1, 'handler should not fire after unsubscribe')
})

})
