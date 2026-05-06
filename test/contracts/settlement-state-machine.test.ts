import test from 'node:test'
import assert from 'node:assert/strict'
import type { SettlementStatus } from '@/generated/prisma/enums'

/**
 * Contract test: declarative truth table for `Settlement` transitions.
 *
 * Settlement does NOT yet have an extracted state-machine module
 * (#1340 may add one). The transitions today are scattered across:
 *
 *   - `src/domains/settlements/approve.ts`
 *   - `src/domains/admin/actions.ts` (approveSettlement, markSettlementPaid)
 *   - `src/domains/settlements/calculate.ts`
 *
 * This test pins the canonical truth table that any future extracted
 * FSM must satisfy. The four states form a near-linear progression
 * with a single recovery edge (PENDING_APPROVAL → DRAFT for "send
 * back for adjustments").
 *
 * Invariant: PAID is terminal. The "PAID requires stripeOnboarded"
 * invariant is enforced at the action layer (#1332), not in the FSM,
 * because it depends on Vendor state.
 */

const ALL_STATUSES: SettlementStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'PAID',
]

// Truth table: { from: { to: legal } }. Self-edges are illegal
// (settlement updates that mutate amounts but keep the same status
// don't go through a transition guard).
const LEGAL_EDGES: Record<SettlementStatus, Set<SettlementStatus>> = {
  DRAFT: new Set<SettlementStatus>(['PENDING_APPROVAL', 'APPROVED']),
  PENDING_APPROVAL: new Set<SettlementStatus>(['APPROVED', 'DRAFT']),
  APPROVED: new Set<SettlementStatus>(['PAID']),
  PAID: new Set<SettlementStatus>([]),
}

function canTransitionSettlement(
  from: SettlementStatus,
  to: SettlementStatus,
): boolean {
  return LEGAL_EDGES[from].has(to)
}

test('truth table covers all 4 SettlementStatus values', () => {
  assert.equal(ALL_STATUSES.length, 4)
  for (const status of ALL_STATUSES) {
    assert.ok(LEGAL_EDGES[status], `truth table missing key for ${status}`)
  }
})

test('PAID is terminal — no outgoing edges', () => {
  for (const to of ALL_STATUSES) {
    assert.equal(canTransitionSettlement('PAID', to), false, `PAID → ${to}`)
  }
})

test('full 16-cell matrix', () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const expected = LEGAL_EDGES[from].has(to)
      assert.equal(
        canTransitionSettlement(from, to),
        expected,
        `${from} → ${to}: expected ${expected}`,
      )
    }
  }
})

test('happy path: DRAFT → PENDING_APPROVAL → APPROVED → PAID', () => {
  assert.equal(canTransitionSettlement('DRAFT', 'PENDING_APPROVAL'), true)
  assert.equal(canTransitionSettlement('PENDING_APPROVAL', 'APPROVED'), true)
  assert.equal(canTransitionSettlement('APPROVED', 'PAID'), true)
})

test('DRAFT can shortcut directly to APPROVED (admin fast-path #403)', () => {
  // src/domains/admin/actions.ts:approveSettlement allows both DRAFT
  // and PENDING_APPROVAL as the starting state for an APPROVED move.
  assert.equal(canTransitionSettlement('DRAFT', 'APPROVED'), true)
})

test('PENDING_APPROVAL → DRAFT is the only "rewind" recovery', () => {
  // src/domains/settlements/approve.ts:rejectSettlement sends a
  // settlement back for adjustments. No other rewind exists.
  assert.equal(canTransitionSettlement('PENDING_APPROVAL', 'DRAFT'), true)
  assert.equal(canTransitionSettlement('APPROVED', 'DRAFT'), false)
  assert.equal(canTransitionSettlement('APPROVED', 'PENDING_APPROVAL'), false)
})

test('No transitions can skip APPROVED on the way to PAID', () => {
  // Money cannot leave the platform without an APPROVED row first.
  assert.equal(canTransitionSettlement('DRAFT', 'PAID'), false)
  assert.equal(canTransitionSettlement('PENDING_APPROVAL', 'PAID'), false)
})
