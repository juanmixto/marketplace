import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import {
  getAdminAuditLog,
  getAdminAuditLogFacets,
} from '@/domains/admin/audit-log'
import { resetIntegrationDatabase, createUser } from './helpers'

/**
 * Issue #1357 (epic #1346 — PII pre-launch).
 *
 * `/admin/audit` is the SUPERADMIN viewer over `AuditLog`. This suite
 * exercises the read-side contract:
 *   - filter combinations (actorId, actorRole, entityType, action, date)
 *   - pagination correctness
 *   - PII scrubbing applied to before/after JSON at read time
 *   - facet endpoint returns sorted distinct values
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

async function seedRows() {
  const adminA = await createUser('ADMIN_OPS')
  const adminB = await createUser('ADMIN_FINANCE')

  await db.auditLog.createMany({
    data: [
      {
        action: 'VENDOR_APPROVED',
        entityType: 'Vendor',
        entityId: 'v_1',
        actorId: adminA.id,
        actorRole: 'ADMIN_OPS',
        ip: '10.0.0.1',
        // PII inside `after` to verify the scrubber runs at read time.
        after: { email: 'leak@example.com', other: 'safe' },
      },
      {
        action: 'INCIDENT_REFUND_ISSUED',
        entityType: 'Incident',
        entityId: 'i_1',
        actorId: adminB.id,
        actorRole: 'ADMIN_FINANCE',
        ip: '10.0.0.2',
        after: { phone: '+34 600 123 456', amount: 42 },
      },
      {
        action: 'DATA_SEARCH',
        entityType: 'admin-orders',
        entityId: 'qhash-abc',
        actorId: adminA.id,
        actorRole: 'ADMIN_OPS',
        ip: '10.0.0.1',
      },
    ],
  })

  return { adminA, adminB }
}

test('getAdminAuditLog returns rows ordered by createdAt desc with pagination', async () => {
  await seedRows()
  const page = await getAdminAuditLog({ page: 1, pageSize: 2 })
  assert.equal(page.totalCount, 3)
  assert.equal(page.totalPages, 2)
  assert.equal(page.page, 1)
  assert.equal(page.rows.length, 2)
  // Latest first.
  assert.ok(page.rows[0]!.createdAt >= page.rows[1]!.createdAt)
})

test('getAdminAuditLog scrubs PII inside before/after at read time', async () => {
  await seedRows()
  const page = await getAdminAuditLog({ action: 'VENDOR_APPROVED' })
  assert.equal(page.rows.length, 1)
  const after = page.rows[0]?.after as Record<string, unknown> | undefined
  // The scrubber's key-pattern collapses `email` to '[redacted]'.
  assert.equal(after?.email, '[redacted]')
  // Non-sensitive sibling preserved.
  assert.equal(after?.other, 'safe')
})

test('getAdminAuditLog scrubs phone values too (key-redacted)', async () => {
  await seedRows()
  const page = await getAdminAuditLog({ action: 'INCIDENT_REFUND_ISSUED' })
  const after = page.rows[0]?.after as Record<string, unknown> | undefined
  assert.equal(after?.phone, '[redacted]')
  // amount is not PII.
  assert.equal(after?.amount, 42)
})

test('getAdminAuditLog filters by actorId', async () => {
  const { adminA } = await seedRows()
  const page = await getAdminAuditLog({ actorId: adminA.id })
  assert.equal(page.totalCount, 2)
  assert.ok(page.rows.every(r => r.actorId === adminA.id))
})

test('getAdminAuditLog filters by entityType', async () => {
  await seedRows()
  const page = await getAdminAuditLog({ entityType: 'Incident' })
  assert.equal(page.totalCount, 1)
  assert.equal(page.rows[0]?.entityType, 'Incident')
})

test('getAdminAuditLog filters by date range (toDate inclusive end-of-day)', async () => {
  await seedRows()
  const todayIso = new Date().toISOString().slice(0, 10)
  const page = await getAdminAuditLog({ fromDate: todayIso, toDate: todayIso })
  assert.equal(page.totalCount, 3)
})

test('getAdminAuditLogFacets returns sorted distinct values', async () => {
  await seedRows()
  const facets = await getAdminAuditLogFacets()
  assert.deepEqual(facets.actorRoles, ['ADMIN_FINANCE', 'ADMIN_OPS'])
  assert.deepEqual(facets.entityTypes, ['Incident', 'Vendor', 'admin-orders'])
  assert.ok(facets.actions.includes('DATA_SEARCH'))
  assert.ok(facets.actions.includes('VENDOR_APPROVED'))
  assert.ok(facets.actions.includes('INCIDENT_REFUND_ISSUED'))
})
