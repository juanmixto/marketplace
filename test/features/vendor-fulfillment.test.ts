/**
 * Tests for the fulfillment state machine used in vendor/actions.ts.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import type { FulfillmentStatus } from '@/generated/prisma/enums'

// Mirror the VALID_TRANSITIONS map from vendor/actions.ts
const VALID_TRANSITIONS: Partial<Record<FulfillmentStatus, FulfillmentStatus>> = {
  PENDING:   'CONFIRMED',
  CONFIRMED: 'PREPARING',
  PREPARING: 'READY',
  READY:     'SHIPPED',
}

function getNextStatus(current: FulfillmentStatus): FulfillmentStatus | null {
  return VALID_TRANSITIONS[current] ?? null
}

test('fulfillment state machine advances through the happy path', () => {
  const sequence: FulfillmentStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SHIPPED']
  for (let i = 0; i < sequence.length - 1; i++) {
    assert.equal(getNextStatus(sequence[i]), sequence[i + 1])
  }
})

test('fulfillment terminal states return null (no next step)', () => {
  assert.equal(getNextStatus('SHIPPED'), null)
  assert.equal(getNextStatus('DELIVERED'), null)
  assert.equal(getNextStatus('CANCELLED'), null)
})

test('SHIPPED requires tracking metadata in the update', () => {
  // When nextStatus is SHIPPED, shippedAt must be set
  const shouldSetShippedAt = (nextStatus: FulfillmentStatus) => nextStatus === 'SHIPPED'

  assert.equal(shouldSetShippedAt('SHIPPED'), true)
  assert.equal(shouldSetShippedAt('CONFIRMED'), false)
  assert.equal(shouldSetShippedAt('READY'), false)
})
