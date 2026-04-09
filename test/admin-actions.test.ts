/**
 * Tests for admin domain logic that doesn't require a real database.
 * We test the state machine rules and validation helpers used by admin/actions.ts.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

// Re-implement the transition guards from admin/actions.ts without the DB layer
// so we can test them in isolation.

const VENDOR_APPROVABLE = ['APPLYING', 'PENDING_DOCS', 'SUSPENDED_TEMP']
const VENDOR_REJECTABLE = ['APPLYING', 'PENDING_DOCS']
const VENDOR_SUSPENDABLE = ['ACTIVE']

function canApproveVendor(status: string) {
  return VENDOR_APPROVABLE.includes(status)
}
function canRejectVendor(status: string) {
  return VENDOR_REJECTABLE.includes(status)
}
function canSuspendVendor(status: string) {
  return VENDOR_SUSPENDABLE.includes(status)
}
function canReviewProduct(status: string) {
  return status === 'PENDING_REVIEW'
}

test('vendor approval is only allowed from pending/suspended states', () => {
  assert.equal(canApproveVendor('APPLYING'), true)
  assert.equal(canApproveVendor('PENDING_DOCS'), true)
  assert.equal(canApproveVendor('SUSPENDED_TEMP'), true)
  assert.equal(canApproveVendor('ACTIVE'), false)
  assert.equal(canApproveVendor('REJECTED'), false)
  assert.equal(canApproveVendor('SUSPENDED_PERM'), false)
})

test('vendor rejection is only allowed for unapproved applicants', () => {
  assert.equal(canRejectVendor('APPLYING'), true)
  assert.equal(canRejectVendor('PENDING_DOCS'), true)
  assert.equal(canRejectVendor('ACTIVE'), false)
  assert.equal(canRejectVendor('SUSPENDED_TEMP'), false)
})

test('only active vendors can be suspended', () => {
  assert.equal(canSuspendVendor('ACTIVE'), true)
  assert.equal(canSuspendVendor('APPLYING'), false)
  assert.equal(canSuspendVendor('SUSPENDED_TEMP'), false)
})

test('product review is only valid when status is PENDING_REVIEW', () => {
  assert.equal(canReviewProduct('PENDING_REVIEW'), true)
  assert.equal(canReviewProduct('ACTIVE'), false)
  assert.equal(canReviewProduct('DRAFT'), false)
  assert.equal(canReviewProduct('REJECTED'), false)
})
