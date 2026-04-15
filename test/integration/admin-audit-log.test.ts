import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { approveVendor } from '@/domains/admin/actions'
import { db } from '@/lib/db'
import { resetServerEnvCache } from '@/lib/env'
import {
  buildSession,
  clearTestSession,
  createUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

// Pins the forensic contract for admin mutations: a successful
// `approveVendor` must persist exactly one VENDOR_APPROVED AuditLog
// row bound to the acting admin, and a no-op repeat must not add a
// second row. Guards against silent regressions in src/lib/audit.ts
// or in any caller that forgets the audit side effect.
//
// Known gap NOT covered by this test: `createAuditLog` wraps its
// db.create in a try/catch that only console.errors on failure, so
// an audit insert can silently fail while the mutation commits. The
// audit write also lives outside db.$transaction in admin/actions.ts.
// Both are pre-existing structural concerns — fixing them changes
// production behavior and belongs in a separate PR, not in this test.

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
  resetServerEnvCache()
})

async function createApplyingVendor() {
  const vendorUser = await createUser('VENDOR')
  return db.vendor.create({
    data: {
      userId: vendorUser.id,
      slug: `applying-${randomUUID().slice(0, 8)}`,
      displayName: 'Applying Vendor',
      status: 'APPLYING',
      stripeOnboarded: false,
    },
  })
}

test('approveVendor writes exactly one VENDOR_APPROVED audit row', async () => {
  const admin = await createUser('SUPERADMIN')
  const vendor = await createApplyingVendor()

  useTestSession(buildSession(admin.id, 'SUPERADMIN'))

  await approveVendor(vendor.id)

  const updated = await db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })
  assert.equal(updated.status, 'ACTIVE')

  const auditRows = await db.auditLog.findMany({
    where: { entityType: 'Vendor', entityId: vendor.id },
  })
  assert.equal(auditRows.length, 1, 'expected exactly one audit row for the approval')

  const row = auditRows[0]!
  assert.equal(row.action, 'VENDOR_APPROVED')
  assert.equal(row.entityType, 'Vendor')
  assert.equal(row.entityId, vendor.id)
  assert.equal(row.actorId, admin.id)
  assert.equal(row.actorRole, 'SUPERADMIN')
  assert.ok(row.createdAt instanceof Date)
  // TRUST_PROXY_HEADERS is unset in the integration harness, so the
  // audit IP gate returns null without touching next/headers.
  assert.equal(row.ip, null)
})

test('approveVendor on an already-active vendor throws and does NOT write a second audit row', async () => {
  const admin = await createUser('SUPERADMIN')
  const vendor = await createApplyingVendor()

  useTestSession(buildSession(admin.id, 'SUPERADMIN'))

  await approveVendor(vendor.id)
  await assert.rejects(
    () => approveVendor(vendor.id),
    /activo|suspendido/i,
    'second approval should reject with a user-visible error',
  )

  const auditRows = await db.auditLog.findMany({
    where: { entityType: 'Vendor', entityId: vendor.id },
  })
  assert.equal(
    auditRows.length,
    1,
    'second call must not create an additional audit row',
  )
})
