import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { setAdminUserActiveState } from '@/domains/admin'
import {
  buildSession,
  clearTestSession,
  resetIntegrationDatabase,
  useTestSession,
  createUser,
  createVendorUser,
} from './helpers'

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

async function createAdmin(role: 'ADMIN_SUPPORT' | 'ADMIN_CATALOG' | 'ADMIN_OPS' | 'SUPERADMIN') {
  const user = await db.user.create({
    data: {
      email: `${role.toLowerCase()}-${Date.now()}@example.com`,
      firstName: role,
      lastName: 'Admin',
      role,
      isActive: true,
      emailVerified: new Date(),
    },
  })
  useTestSession(buildSession(user.id, role))
  return user
}

test('setAdminUserActiveState blocks and unblocks customer accounts with authVersion bumps', async () => {
  await createAdmin('ADMIN_OPS')
  const customer = await createUser('CUSTOMER')

  const blocked = await setAdminUserActiveState(customer.id, false)
  assert.equal(blocked.userId, customer.id)
  assert.equal(blocked.isActive, false)
  assert.equal(blocked.vendorStatus, null)
  assert.equal(blocked.authVersion, 1)

  const afterBlock = await db.user.findUnique({
    where: { id: customer.id },
    select: { isActive: true, authVersion: true, deletedAt: true },
  })
  assert.equal(afterBlock?.isActive, false)
  assert.equal(afterBlock?.authVersion, 1)
  assert.equal(afterBlock?.deletedAt, null)

  const blockedAudit = await db.auditLog.findFirst({
    where: { action: 'ADMIN_USER_BLOCKED', entityId: customer.id },
    orderBy: { createdAt: 'desc' },
  })
  assert.ok(blockedAudit)

  const unblocked = await setAdminUserActiveState(customer.id, true)
  assert.equal(unblocked.isActive, true)
  assert.equal(unblocked.authVersion, 2)

  const unblockedAudit = await db.auditLog.findFirst({
    where: { action: 'ADMIN_USER_UNBLOCKED', entityId: customer.id },
    orderBy: { createdAt: 'desc' },
  })
  assert.ok(unblockedAudit)
})

test('setAdminUserActiveState suspends and restores active producers', async () => {
  await createAdmin('SUPERADMIN')
  const { user, vendor } = await createVendorUser()

  const blocked = await setAdminUserActiveState(user.id, false)
  assert.equal(blocked.isActive, false)
  assert.equal(blocked.vendorStatus, 'SUSPENDED_TEMP')

  const vendorAfterBlock = await db.vendor.findUnique({
    where: { id: vendor.id },
    select: { status: true },
  })
  assert.equal(vendorAfterBlock?.status, 'SUSPENDED_TEMP')

  const unblocked = await setAdminUserActiveState(user.id, true)
  assert.equal(unblocked.isActive, true)
  assert.equal(unblocked.vendorStatus, 'ACTIVE')

  const vendorAfterUnblock = await db.vendor.findUnique({
    where: { id: vendor.id },
    select: { status: true },
  })
  assert.equal(vendorAfterUnblock?.status, 'ACTIVE')
})

test('setAdminUserActiveState rejects unsupported admin sub-roles', async () => {
  await createAdmin('ADMIN_SUPPORT')
  const customer = await createUser('CUSTOMER')

  await assert.rejects(
    () => setAdminUserActiveState(customer.id, false),
    /NEXT_REDIRECT|redirect/i,
  )
})

test('setAdminUserActiveState refuses self-deactivation', async () => {
  const admin = await createAdmin('ADMIN_OPS')

  await assert.rejects(
    () => setAdminUserActiveState(admin.id, false),
    /own account/i,
  )
})
