import test from 'node:test'
import assert from 'node:assert/strict'
import {
  on,
  emit,
  clearHandlersForTest,
} from '@/domains/notifications/dispatcher'

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

  await new Promise(r => setImmediate(r))
  await new Promise(r => setImmediate(r))

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

  await new Promise(r => setImmediate(r))
  await new Promise(r => setImmediate(r))

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

  await new Promise(r => setImmediate(r))
  await new Promise(r => setImmediate(r))
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
  await new Promise(r => setImmediate(r))
  await new Promise(r => setImmediate(r))
  assert.equal(count, 1)

  unsub()

  emit('order.created', {
    orderId: 'ord_4',
    vendorId: 'vnd_3',
    customerName: 'Carol',
    totalCents: 200,
    currency: 'EUR',
  })
  await new Promise(r => setImmediate(r))
  await new Promise(r => setImmediate(r))
  assert.equal(count, 1, 'handler should not fire after unsubscribe')
})
