import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isTerminal,
  isValidTransition,
} from '@/domains/shipping/domain/state-machine'
import type { ShipmentStatusInternal } from '@/domains/shipping/domain/types'

/**
 * Contract test: full 9×9 truth table for `Shipment` transitions.
 *
 * The rule (see `src/domains/shipping/domain/state-machine.ts`):
 *
 *  - No self-edges.
 *  - No outgoing edges from terminals (DELIVERED, CANCELLED, FAILED).
 *  - EXCEPTION can recover to IN_TRANSIT or OUT_FOR_DELIVERY.
 *  - Anyone can move to EXCEPTION, CANCELLED, or FAILED.
 *  - Otherwise, only forward-rank moves (to.rank > from.rank).
 *
 * This test pins the canonical truth table; the source FSM is the
 * thing the test verifies, not the other way around.
 */

const ALL_STATUSES: ShipmentStatusInternal[] = [
  'DRAFT',
  'LABEL_REQUESTED',
  'LABEL_CREATED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION',
  'CANCELLED',
  'FAILED',
]

const TERMINALS: Set<ShipmentStatusInternal> = new Set(['DELIVERED', 'CANCELLED', 'FAILED'])

const RANK: Record<ShipmentStatusInternal, number> = {
  DRAFT: 0,
  LABEL_REQUESTED: 1,
  LABEL_CREATED: 2,
  IN_TRANSIT: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
  EXCEPTION: 3,
  CANCELLED: 6,
  FAILED: 6,
}

function expectedLegal(from: ShipmentStatusInternal, to: ShipmentStatusInternal): boolean {
  if (from === to) return false
  if (TERMINALS.has(from)) return false
  if (from === 'EXCEPTION' && (to === 'IN_TRANSIT' || to === 'OUT_FOR_DELIVERY')) return true
  if (to === 'EXCEPTION') return true
  if (to === 'CANCELLED' || to === 'FAILED') return true
  return RANK[to] > RANK[from]
}

test('truth table covers all 9 ShipmentStatusInternal values', () => {
  assert.equal(ALL_STATUSES.length, 9)
})

test('isTerminal flags exactly DELIVERED, CANCELLED, FAILED', () => {
  for (const status of ALL_STATUSES) {
    assert.equal(isTerminal(status), TERMINALS.has(status), `isTerminal(${status})`)
  }
})

test('isValidTransition agrees with the truth table for all 81 (from, to) pairs', () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const expected = expectedLegal(from, to)
      const got = isValidTransition(from, to)
      assert.equal(
        got,
        expected,
        `${from} → ${to}: expected ${expected}, got ${got}`,
      )
    }
  }
})

test('terminals never have an outgoing legal edge', () => {
  for (const terminal of TERMINALS) {
    for (const to of ALL_STATUSES) {
      assert.equal(
        isValidTransition(terminal, to),
        false,
        `terminal ${terminal} → ${to} must be illegal`,
      )
    }
  }
})

test('EXCEPTION recovers to IN_TRANSIT and OUT_FOR_DELIVERY', () => {
  assert.equal(isValidTransition('EXCEPTION', 'IN_TRANSIT'), true)
  assert.equal(isValidTransition('EXCEPTION', 'OUT_FOR_DELIVERY'), true)
  // But not to earlier rank states.
  assert.equal(isValidTransition('EXCEPTION', 'DRAFT'), false)
  assert.equal(isValidTransition('EXCEPTION', 'LABEL_REQUESTED'), false)
  assert.equal(isValidTransition('EXCEPTION', 'LABEL_CREATED'), false)
})

test('any non-terminal can move to EXCEPTION, CANCELLED, or FAILED', () => {
  for (const from of ALL_STATUSES) {
    if (TERMINALS.has(from)) continue
    for (const escape of ['EXCEPTION', 'CANCELLED', 'FAILED'] as ShipmentStatusInternal[]) {
      // Self-edges are still illegal even with an escape destination.
      const expected = from !== escape
      assert.equal(
        isValidTransition(from, escape),
        expected,
        `${from} → ${escape}`,
      )
    }
  }
})

test('forward jumps within the linear path are allowed (out-of-order webhooks)', () => {
  // Stripe / Sendcloud webhooks may arrive out of order; the FSM
  // tolerates rank skips as long as motion is forward.
  assert.equal(isValidTransition('DRAFT', 'IN_TRANSIT'), true)
  assert.equal(isValidTransition('LABEL_REQUESTED', 'OUT_FOR_DELIVERY'), true)
  assert.equal(isValidTransition('LABEL_CREATED', 'DELIVERED'), true)
})

test('backwards motion within the linear path is rejected', () => {
  assert.equal(isValidTransition('IN_TRANSIT', 'LABEL_REQUESTED'), false)
  assert.equal(isValidTransition('OUT_FOR_DELIVERY', 'IN_TRANSIT'), false)
  assert.equal(isValidTransition('LABEL_CREATED', 'DRAFT'), false)
})
