import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isTerminal,
  isValidTransition,
} from '@/domains/shipping/domain/state-machine'

test('isTerminal flags delivered / cancelled / failed', () => {
  assert.equal(isTerminal('DELIVERED'), true)
  assert.equal(isTerminal('CANCELLED'), true)
  assert.equal(isTerminal('FAILED'), true)
  assert.equal(isTerminal('IN_TRANSIT'), false)
  assert.equal(isTerminal('LABEL_REQUESTED'), false)
})

test('isValidTransition: forward motion through the happy path is allowed', () => {
  assert.equal(isValidTransition('DRAFT', 'LABEL_REQUESTED'), true)
  assert.equal(isValidTransition('LABEL_REQUESTED', 'LABEL_CREATED'), true)
  assert.equal(isValidTransition('LABEL_CREATED', 'IN_TRANSIT'), true)
  assert.equal(isValidTransition('IN_TRANSIT', 'OUT_FOR_DELIVERY'), true)
  assert.equal(isValidTransition('OUT_FOR_DELIVERY', 'DELIVERED'), true)
})

test('isValidTransition: terminal states never transition further', () => {
  assert.equal(isValidTransition('DELIVERED', 'IN_TRANSIT'), false)
  assert.equal(isValidTransition('CANCELLED', 'LABEL_REQUESTED'), false)
  assert.equal(isValidTransition('FAILED', 'LABEL_REQUESTED'), false)
})

test('isValidTransition: backwards motion is rejected (no time travel)', () => {
  assert.equal(isValidTransition('DELIVERED', 'IN_TRANSIT'), false)
  assert.equal(isValidTransition('IN_TRANSIT', 'LABEL_CREATED'), false)
})

test('isValidTransition: EXCEPTION can recover into transit states', () => {
  assert.equal(isValidTransition('EXCEPTION', 'IN_TRANSIT'), true)
  assert.equal(isValidTransition('EXCEPTION', 'OUT_FOR_DELIVERY'), true)
})

test('isValidTransition: jumps forward are allowed (tolerates out-of-order webhooks)', () => {
  // Webhook says "delivered" before we saw "in_transit"
  assert.equal(isValidTransition('LABEL_CREATED', 'DELIVERED'), true)
  assert.equal(isValidTransition('LABEL_REQUESTED', 'IN_TRANSIT'), true)
})

test('isValidTransition: any non-terminal can move to EXCEPTION / CANCELLED / FAILED', () => {
  assert.equal(isValidTransition('LABEL_REQUESTED', 'EXCEPTION'), true)
  assert.equal(isValidTransition('IN_TRANSIT', 'CANCELLED'), true)
  assert.equal(isValidTransition('LABEL_REQUESTED', 'FAILED'), true)
})

test('isValidTransition: same-state transition is a no-op', () => {
  assert.equal(isValidTransition('IN_TRANSIT', 'IN_TRANSIT'), false)
})
