import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ORDER_TRANSITIONS,
  assertOrderTransition,
  canTransitionOrder,
} from '@/domains/orders/state-machine'

test('canTransitionOrder: happy-path forward edges are allowed', () => {
  assert.equal(canTransitionOrder('PLACED', 'PAYMENT_CONFIRMED'), true)
  assert.equal(canTransitionOrder('PAYMENT_CONFIRMED', 'PROCESSING'), true)
  assert.equal(canTransitionOrder('PROCESSING', 'PARTIALLY_SHIPPED'), true)
  assert.equal(canTransitionOrder('PARTIALLY_SHIPPED', 'SHIPPED'), true)
  assert.equal(canTransitionOrder('SHIPPED', 'DELIVERED'), true)
  assert.equal(canTransitionOrder('DELIVERED', 'REFUNDED'), true)
})

test('canTransitionOrder: cancel edges are allowed where the doc says they are', () => {
  assert.equal(canTransitionOrder('PLACED', 'CANCELLED'), true)
  assert.equal(canTransitionOrder('PAYMENT_CONFIRMED', 'CANCELLED'), true)
  assert.equal(canTransitionOrder('PROCESSING', 'CANCELLED'), true)
  assert.equal(canTransitionOrder('PARTIALLY_SHIPPED', 'CANCELLED'), true)
})

test('canTransitionOrder: refund edges are allowed from any post-capture state', () => {
  assert.equal(canTransitionOrder('PAYMENT_CONFIRMED', 'REFUNDED'), true)
  assert.equal(canTransitionOrder('PROCESSING', 'REFUNDED'), true)
  assert.equal(canTransitionOrder('SHIPPED', 'REFUNDED'), true)
  assert.equal(canTransitionOrder('DELIVERED', 'REFUNDED'), true)
})

test('canTransitionOrder: terminals have no outgoing edges', () => {
  assert.equal(canTransitionOrder('CANCELLED', 'PLACED'), false)
  assert.equal(canTransitionOrder('CANCELLED', 'REFUNDED'), false)
  assert.equal(canTransitionOrder('CANCELLED', 'PAYMENT_CONFIRMED'), false)
  assert.equal(canTransitionOrder('REFUNDED', 'PLACED'), false)
  assert.equal(canTransitionOrder('REFUNDED', 'CANCELLED'), false)
})

test('canTransitionOrder: backwards motion is rejected', () => {
  assert.equal(canTransitionOrder('PAYMENT_CONFIRMED', 'PLACED'), false)
  assert.equal(canTransitionOrder('SHIPPED', 'PROCESSING'), false)
  assert.equal(canTransitionOrder('DELIVERED', 'SHIPPED'), false)
})

test('canTransitionOrder: PLACED cannot skip to DELIVERED', () => {
  assert.equal(canTransitionOrder('PLACED', 'DELIVERED'), false)
  assert.equal(canTransitionOrder('PLACED', 'PROCESSING'), false)
  assert.equal(canTransitionOrder('PLACED', 'SHIPPED'), false)
  assert.equal(canTransitionOrder('PLACED', 'REFUNDED'), false)
})

test('canTransitionOrder: PLACED cannot transition straight to REFUNDED (refund needs capture first)', () => {
  assert.equal(canTransitionOrder('PLACED', 'REFUNDED'), false)
})

test('canTransitionOrder: self-edges are allowed (idempotent re-writes)', () => {
  for (const status of Object.keys(ORDER_TRANSITIONS) as Array<keyof typeof ORDER_TRANSITIONS>) {
    assert.equal(canTransitionOrder(status, status), true, `self-edge for ${status}`)
  }
})

test('assertOrderTransition: throws on illegal transition with a clear message', () => {
  assert.throws(
    () => assertOrderTransition('CANCELLED', 'PROCESSING'),
    /Invalid Order status transition: CANCELLED → PROCESSING/,
  )
})

test('assertOrderTransition: does not throw on legal transitions', () => {
  assert.doesNotThrow(() => assertOrderTransition('PLACED', 'PAYMENT_CONFIRMED'))
  assert.doesNotThrow(() => assertOrderTransition('SHIPPED', 'DELIVERED'))
})

test('ORDER_TRANSITIONS: every OrderStatus is keyed', () => {
  const keys = Object.keys(ORDER_TRANSITIONS).sort()
  assert.deepEqual(keys, [
    'CANCELLED',
    'DELIVERED',
    'PARTIALLY_SHIPPED',
    'PAYMENT_CONFIRMED',
    'PLACED',
    'PROCESSING',
    'REFUNDED',
    'SHIPPED',
  ])
})
