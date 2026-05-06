import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { trackCreate, trackUpdate, SYSTEM } from '@/lib/actor-tracking'
import { approveVendor, suspendVendor } from '@/domains/admin/actions'
import {
  buildSession,
  clearTestSession,
  createUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

/**
 * Issue #1359 (epic #1346 — PII pre-launch).
 *
 * Second source of actor traceability: every high-value mutation must
 * stamp `updatedById` (and create-time `createdById`) on User / Order /
 * Vendor / Product. If `AuditLog` is later purged or a writer-side bug
 * skips the audit row, the table itself still tells us who touched
 * the row.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

test('trackCreate populates both createdById and updatedById', () => {
  const out = trackCreate('user-123')
  assert.equal(out.createdById, 'user-123')
  assert.equal(out.updatedById, 'user-123')
})

test('trackUpdate populates only updatedById', () => {
  const out = trackUpdate('user-123')
  assert.deepEqual(out, { updatedById: 'user-123' })
})

test('trackCreate / trackUpdate accept null for system writes', () => {
  assert.equal(trackCreate(null).createdById, null)
  assert.equal(trackCreate(null).updatedById, null)
  assert.equal(trackUpdate(null).updatedById, null)
})

test('trackCreate accepts the SYSTEM sentinel', () => {
  const out = trackCreate(SYSTEM)
  assert.equal(out.createdById, 'system')
  assert.equal(out.updatedById, 'system')
})

test('trackUpdate trims and treats empty string as null', () => {
  assert.equal(trackUpdate('  ').updatedById, null)
})

test('approveVendor stamps updatedById on the Vendor row', async () => {
  const admin = await createUser('ADMIN_OPS')
  const vendorUser = await createUser('CUSTOMER')
  const vendor = await db.vendor.create({
    data: {
      userId: vendorUser.id,
      slug: `v-${Date.now()}`,
      displayName: 'Tracking Test',
      status: 'APPLYING',
    },
  })

  useTestSession(buildSession(admin.id, 'ADMIN_OPS'))
  await approveVendor(vendor.id)

  const after = await db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })
  assert.equal(after.status, 'ACTIVE')
  assert.equal(after.updatedById, admin.id)
  // `createdById` was never set (vendor was created without
  // tracking — that's the historical-row contract). The whole point
  // of #1359 is that NEW writes stamp the actor; old rows stay null.
  assert.equal(after.createdById, null)
})

test('suspendVendor stamps updatedById on subsequent edits', async () => {
  const adminA = await createUser('ADMIN_OPS')
  const adminB = await createUser('ADMIN_OPS')
  const vendorUser = await createUser('CUSTOMER')
  const vendor = await db.vendor.create({
    data: {
      userId: vendorUser.id,
      slug: `v-${Date.now()}`,
      displayName: 'Tracking Test 2',
      status: 'APPLYING',
    },
  })

  useTestSession(buildSession(adminA.id, 'ADMIN_OPS'))
  await approveVendor(vendor.id)

  useTestSession(buildSession(adminB.id, 'ADMIN_OPS'))
  await suspendVendor(vendor.id)

  const after = await db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })
  assert.equal(after.status, 'SUSPENDED_TEMP')
  // updatedById reflects the LATEST mutation (adminB), not the create.
  assert.equal(after.updatedById, adminB.id)
})
