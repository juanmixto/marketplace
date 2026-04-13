import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidTransition, isTerminal } from '@/domains/shipping/domain/state-machine'

test('Cancelled and Failed are terminal and cannot move even into each other', () => {
  assert.equal(isValidTransition('CANCELLED', 'FAILED'), false)
  assert.equal(isValidTransition('FAILED', 'CANCELLED'), false)
  assert.equal(isValidTransition('DELIVERED', 'CANCELLED'), false)
})

test('Exception can stay blocked until manual cancel', () => {
  assert.equal(isValidTransition('EXCEPTION', 'CANCELLED'), true)
  // Going back to an earlier creation phase is not allowed
  assert.equal(isValidTransition('EXCEPTION', 'LABEL_CREATED'), false)
})

test('Label created can be cancelled before handover', () => {
  assert.equal(isValidTransition('LABEL_CREATED', 'CANCELLED'), true)
})

test('Out for delivery cannot go back to in transit', () => {
  assert.equal(isValidTransition('OUT_FOR_DELIVERY', 'IN_TRANSIT'), false)
})

test('Delivered cannot move to anywhere, even exception', () => {
  assert.equal(isValidTransition('DELIVERED', 'EXCEPTION'), false)
  assert.equal(isValidTransition('DELIVERED', 'DELIVERED'), false)
})

test('isTerminal correctly classifies every state', () => {
  const terminal = ['DELIVERED', 'CANCELLED', 'FAILED'] as const
  const nonTerminal = [
    'DRAFT',
    'LABEL_REQUESTED',
    'LABEL_CREATED',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'EXCEPTION',
  ] as const
  for (const s of terminal) assert.equal(isTerminal(s), true, `${s} should be terminal`)
  for (const s of nonTerminal) assert.equal(isTerminal(s), false, `${s} should not be terminal`)
})
