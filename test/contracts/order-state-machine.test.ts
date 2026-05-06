import test from 'node:test'
import assert from 'node:assert/strict'
import type { OrderStatus } from '@/generated/prisma/enums'
import {
  ORDER_TRANSITIONS,
  assertOrderTransition,
  canTransitionOrder,
} from '@/domains/orders/state-machine'

/**
 * Contract test: every legal `OrderStatus` transition is enumerated
 * here as the canonical truth table. The 8×8 matrix is the test —
 * every pair of statuses is asserted to either match or violate the
 * declarative table in `src/domains/orders/state-machine.ts`. Adding
 * a status to the enum without updating this matrix is an error.
 *
 * See `docs/state-machines.md` § Order for the human-readable diagram.
 */

const ALL_STATUSES: OrderStatus[] = [
  'PLACED',
  'PAYMENT_CONFIRMED',
  'PROCESSING',
  'PARTIALLY_SHIPPED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
]

// Truth table: { from: { to: legal } }. Self-edges are always legal
// (idempotent re-writes — see state-machine.ts JSDoc).
const LEGAL_EDGES: Record<OrderStatus, Set<OrderStatus>> = {
  PLACED: new Set<OrderStatus>(['PLACED', 'PAYMENT_CONFIRMED', 'CANCELLED']),
  PAYMENT_CONFIRMED: new Set<OrderStatus>([
    'PAYMENT_CONFIRMED',
    'PROCESSING',
    'PARTIALLY_SHIPPED',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'REFUNDED',
  ]),
  PROCESSING: new Set<OrderStatus>([
    'PROCESSING',
    'PARTIALLY_SHIPPED',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'REFUNDED',
  ]),
  PARTIALLY_SHIPPED: new Set<OrderStatus>([
    'PARTIALLY_SHIPPED',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'REFUNDED',
  ]),
  SHIPPED: new Set<OrderStatus>(['SHIPPED', 'DELIVERED', 'REFUNDED']),
  DELIVERED: new Set<OrderStatus>(['DELIVERED', 'REFUNDED']),
  CANCELLED: new Set<OrderStatus>(['CANCELLED']),
  REFUNDED: new Set<OrderStatus>(['REFUNDED']),
}

test('truth table covers all 8 OrderStatus values', () => {
  const declared = new Set(Object.keys(ORDER_TRANSITIONS) as OrderStatus[])
  assert.equal(declared.size, 8)
  for (const status of ALL_STATUSES) {
    assert.ok(declared.has(status), `state-machine.ts missing key for ${status}`)
    assert.ok(LEGAL_EDGES[status], `truth table missing key for ${status}`)
  }
})

test('canTransitionOrder agrees with the truth table for all 64 (from, to) pairs', () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const expected = LEGAL_EDGES[from].has(to)
      const got = canTransitionOrder(from, to)
      assert.equal(
        got,
        expected,
        `${from} → ${to}: expected ${expected}, got ${got}`,
      )
    }
  }
})

test('assertOrderTransition throws iff the truth table says illegal', () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const expected = LEGAL_EDGES[from].has(to)
      if (expected) {
        assert.doesNotThrow(
          () => assertOrderTransition(from, to),
          `${from} → ${to} should not throw`,
        )
      } else {
        assert.throws(
          () => assertOrderTransition(from, to),
          new RegExp(`Invalid Order status transition: ${from} → ${to}`),
        )
      }
    }
  }
})

test('terminals (CANCELLED, REFUNDED) have no outgoing edges except self', () => {
  for (const terminal of ['CANCELLED', 'REFUNDED'] as OrderStatus[]) {
    for (const to of ALL_STATUSES) {
      const got = canTransitionOrder(terminal, to)
      assert.equal(
        got,
        terminal === to,
        `terminal ${terminal} → ${to} must be legal only if same`,
      )
    }
  }
})

test('PLACED cannot skip to a fulfillment state without PAYMENT_CONFIRMED first', () => {
  for (const to of ['PROCESSING', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'REFUNDED'] as OrderStatus[]) {
    assert.equal(
      canTransitionOrder('PLACED', to),
      false,
      `PLACED → ${to} must require PAYMENT_CONFIRMED first`,
    )
  }
})

test('REFUNDED is reachable from every post-capture state but not from PLACED', () => {
  // Refund needs an actual capture to refund — PLACED has no payment yet.
  assert.equal(canTransitionOrder('PLACED', 'REFUNDED'), false)
  for (const from of [
    'PAYMENT_CONFIRMED',
    'PROCESSING',
    'PARTIALLY_SHIPPED',
    'SHIPPED',
    'DELIVERED',
  ] as OrderStatus[]) {
    assert.equal(canTransitionOrder(from, 'REFUNDED'), true)
  }
})
