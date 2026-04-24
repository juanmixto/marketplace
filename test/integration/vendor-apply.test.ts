import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { applyAsVendor, getMyVendorApplication } from '@/domains/vendors/apply'
import { approveVendor } from '@/domains/admin/actions'
import { db } from '@/lib/db'
import {
  buildSession,
  clearTestSession,
  createUser,
  createVendorUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

beforeEach(async () => {
  await resetIntegrationDatabase()
  Object.assign(process.env, { NODE_ENV: 'test' })
})

afterEach(() => {
  clearTestSession()
})

test('applyAsVendor: customer can submit application and row is APPLYING', async () => {
  const user = await createUser('CUSTOMER')
  useTestSession(buildSession(user.id, 'CUSTOMER'))

  const result = await applyAsVendor({
    displayName: 'Quesería Los Olmos',
    description: 'Quesos artesanales de cabra',
    location: 'Ávila',
    category: 'CHEESE',
  })

  assert.equal(result.ok, true)
  assert.ok(result.ok && result.vendorId)

  const vendor = await db.vendor.findUnique({ where: { userId: user.id } })
  assert.ok(vendor)
  assert.equal(vendor?.status, 'APPLYING')
  assert.equal(vendor?.displayName, 'Quesería Los Olmos')
  assert.equal(vendor?.category, 'CHEESE')

  const refreshedUser = await db.user.findUnique({ where: { id: user.id } })
  assert.equal(refreshedUser?.role, 'CUSTOMER', 'role should NOT change on application')
})

test('applyAsVendor: rejects unauthenticated callers', async () => {
  useTestSession(null)
  const result = await applyAsVendor({ displayName: 'Nope' })
  assert.equal(result.ok, false)
  assert.equal(result.ok === false && result.error, 'unauthenticated')
})

test('applyAsVendor: idempotent — second application returns already_applied', async () => {
  const user = await createUser('CUSTOMER')
  useTestSession(buildSession(user.id, 'CUSTOMER'))

  const first = await applyAsVendor({ displayName: 'Mi tienda' })
  assert.equal(first.ok, true)

  const second = await applyAsVendor({ displayName: 'Otra tienda' })
  assert.equal(second.ok, false)
  assert.equal(second.ok === false && second.error, 'already_applied')

  const count = await db.vendor.count({ where: { userId: user.id } })
  assert.equal(count, 1)
})

test('applyAsVendor: rejects short displayName with validation error', async () => {
  const user = await createUser('CUSTOMER')
  useTestSession(buildSession(user.id, 'CUSTOMER'))

  const result = await applyAsVendor({ displayName: 'a' })
  assert.equal(result.ok, false)
  assert.equal(result.ok === false && result.error, 'validation')
})

test('applyAsVendor: generates unique slug when displayName collides', async () => {
  const userA = await createUser('CUSTOMER')
  useTestSession(buildSession(userA.id, 'CUSTOMER'))
  const a = await applyAsVendor({ displayName: 'Mi Huerta' })
  assert.equal(a.ok, true)

  const userB = await createUser('CUSTOMER')
  useTestSession(buildSession(userB.id, 'CUSTOMER'))
  const b = await applyAsVendor({ displayName: 'Mi Huerta' })
  assert.equal(b.ok, true)

  const vendors = await db.vendor.findMany({
    where: { userId: { in: [userA.id, userB.id] } },
    select: { slug: true },
  })
  const slugs = vendors.map(v => v.slug)
  assert.equal(new Set(slugs).size, 2, 'slugs should be unique across vendors')
})

test('approveVendor: flips User.role to VENDOR for self-service applicant', async () => {
  // Self-service: CUSTOMER applies
  const user = await createUser('CUSTOMER')
  useTestSession(buildSession(user.id, 'CUSTOMER'))
  const apply = await applyAsVendor({ displayName: 'Panadería Sol' })
  assert.equal(apply.ok, true)
  const vendorId = apply.ok ? apply.vendorId : ''

  // Admin approves
  const admin = await db.user.create({
    data: {
      email: `admin-${Date.now()}@example.com`,
      firstName: 'Admin',
      lastName: 'Tester',
      role: 'SUPERADMIN',
      isActive: true,
    },
  })
  useTestSession(buildSession(admin.id, 'SUPERADMIN'))
  await approveVendor(vendorId)

  const vendor = await db.vendor.findUnique({ where: { id: vendorId } })
  assert.equal(vendor?.status, 'ACTIVE')

  const bumpedUser = await db.user.findUnique({ where: { id: user.id } })
  assert.equal(bumpedUser?.role, 'VENDOR', 'applicant should be promoted to VENDOR')
})

test('approveVendor: does NOT downgrade an admin who also owns a vendor', async () => {
  const admin = await db.user.create({
    data: {
      email: `admin-${Date.now()}@example.com`,
      firstName: 'Admin',
      lastName: 'Tester',
      role: 'SUPERADMIN',
      isActive: true,
    },
  })
  const vendor = await db.vendor.create({
    data: {
      userId: admin.id,
      slug: `admin-vendor-${Date.now()}`,
      displayName: 'Admin Vendor',
      status: 'APPLYING',
    },
  })

  useTestSession(buildSession(admin.id, 'SUPERADMIN'))
  await approveVendor(vendor.id)

  const refreshed = await db.user.findUnique({ where: { id: admin.id } })
  assert.equal(refreshed?.role, 'SUPERADMIN', 'admins must not be downgraded')
})

test('getMyVendorApplication: returns application for the caller', async () => {
  const user = await createUser('CUSTOMER')
  useTestSession(buildSession(user.id, 'CUSTOMER'))
  await applyAsVendor({ displayName: 'Olivar del Sur' })

  const app = await getMyVendorApplication()
  assert.ok(app)
  assert.equal(app?.status, 'APPLYING')
  assert.equal(app?.displayName, 'Olivar del Sur')
})

test('getMyVendorApplication: returns null when user has no application', async () => {
  const user = await createUser('CUSTOMER')
  useTestSession(buildSession(user.id, 'CUSTOMER'))
  const app = await getMyVendorApplication()
  assert.equal(app, null)
})

test('existing vendor flow unaffected: createVendorUser still produces active vendor', async () => {
  const { user, vendor } = await createVendorUser()
  assert.equal(vendor.status, 'ACTIVE')
  assert.equal(user.role, 'VENDOR')
})

test('rejectVendor does not promote the user to VENDOR', async () => {
  const { rejectVendor } = await import('@/domains/admin/actions')

  const user = await createUser('CUSTOMER')
  useTestSession(buildSession(user.id, 'CUSTOMER'))
  const apply = await applyAsVendor({ displayName: 'Granja dudosa' })
  assert.equal(apply.ok, true)
  const vendorId = apply.ok ? apply.vendorId : ''

  const admin = await db.user.create({
    data: {
      email: `admin-${Date.now()}@example.com`,
      firstName: 'Admin',
      lastName: 'Tester',
      role: 'SUPERADMIN',
      isActive: true,
    },
  })
  useTestSession(buildSession(admin.id, 'SUPERADMIN'))
  await rejectVendor(vendorId)

  const refreshedUser = await db.user.findUnique({ where: { id: user.id } })
  assert.equal(refreshedUser?.role, 'CUSTOMER', 'reject must not bump role')
  const vendor = await db.vendor.findUnique({ where: { id: vendorId } })
  assert.equal(vendor?.status, 'REJECTED')
})
