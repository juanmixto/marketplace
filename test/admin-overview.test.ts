import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatAdminPeriodLabel,
  getIncidentStatusTone,
  getOrderStatusTone,
  getProductStatusTone,
  getSettlementStatusTone,
  getToneClasses,
  getVendorStatusTone,
} from '@/domains/admin/overview'

test('admin overview maps status tones consistently', () => {
  assert.equal(getOrderStatusTone('PLACED'), 'amber')
  assert.equal(getOrderStatusTone('DELIVERED'), 'emerald')
  assert.equal(getVendorStatusTone('ACTIVE'), 'emerald')
  assert.equal(getVendorStatusTone('REJECTED'), 'red')
  assert.equal(getProductStatusTone('PENDING_REVIEW'), 'amber')
  assert.equal(getIncidentStatusTone('AWAITING_ADMIN'), 'red')
  assert.equal(getSettlementStatusTone('PAID'), 'emerald')
})

test('getToneClasses returns reusable tailwind tokens', () => {
  assert.match(getToneClasses('blue'), /bg-blue-50/)
  assert.match(getToneClasses('slate'), /text-slate-700/)
})

test('formatAdminPeriodLabel renders a readable period', () => {
  const label = formatAdminPeriodLabel(
    new Date('2026-04-01T00:00:00.000Z'),
    new Date('2026-04-30T00:00:00.000Z')
  )

  assert.match(label, /2026/)
  assert.match(label, /-/)
})
