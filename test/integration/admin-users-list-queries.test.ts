import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { getAdminUsersListData } from '@/domains/admin'
import {
  buildSession,
  clearTestSession,
  resetIntegrationDatabase,
  useTestSession,
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

async function createCustomer(input: {
  email: string
  firstName: string
  lastName: string
  isActive: boolean
  emailVerified: Date | null
}) {
  return db.user.create({
    data: {
      ...input,
      passwordHash: 'hash',
      role: 'CUSTOMER',
    },
  })
}

async function createVendorFixture() {
  const user = await db.user.create({
    data: {
      email: `vendor-${Date.now()}@example.com`,
      firstName: 'Vendor',
      lastName: 'Tester',
      role: 'VENDOR',
      isActive: true,
      emailVerified: new Date(),
    },
  })

  const vendorId = `vendor-${randomUUID().slice(0, 8)}`
  const [vendor] = await db.$queryRawUnsafe<
    Array<{
      id: string
      userId: string
      slug: string
      displayName: string
      status: string
      stripeOnboarded: boolean
      preferredShippingProvider: string | null
      createdAt: Date
      updatedAt: Date
    }>
  >(
    `INSERT INTO "Vendor" (
      "id", "userId", "slug", "displayName", "status", "commissionRate",
      "totalReviews", "stripeOnboarded", "createdAt", "updatedAt",
      "preferredShippingProvider"
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, NOW(), NOW(),
      $9
    )
    RETURNING
      "id", "userId", "slug", "displayName", "status",
      "stripeOnboarded", "preferredShippingProvider", "createdAt", "updatedAt"`,
    vendorId,
    user.id,
    `vendor-${randomUUID().slice(0, 8)}`,
    'Vendor Support',
    'ACTIVE',
    0.12,
    0,
    true,
    null,
  )
  return { user, vendor }
}

test('getAdminUsersListData returns searchable, filterable support rows', async () => {
  await createAdmin('ADMIN_SUPPORT')

  const alice = await createCustomer({
    email: 'alice.support@test.local',
    firstName: 'Alice',
    lastName: 'Support',
    isActive: true,
    emailVerified: new Date(),
  })
  const bob = await createCustomer({
    email: 'bob.inactive@test.local',
    firstName: 'Bob',
    lastName: 'Inactive',
    isActive: false,
    emailVerified: null,
  })
  const { user: vendorUser, vendor } = await createVendorFixture()

  const search = await getAdminUsersListData({ q: 'alice', pageSize: 10 })
  assert.equal(search.pagination.totalUsers, 1)
  assert.equal(search.users[0]?.id, alice.id)
  assert.equal(search.users[0]?.emailMasked.includes('@'), true)
  assert.equal(search.users[0]?.lastLoginAt, null)
  assert.equal(search.users[0]?.lastActivityAt, null)

  const vendorRows = await getAdminUsersListData({
    vendor: 'with-vendor',
    role: 'VENDOR',
    pageSize: 10,
  })
  assert.equal(vendorRows.pagination.totalUsers, 1)
  assert.equal(vendorRows.users[0]?.id, vendorUser.id)
  assert.equal(vendorRows.users[0]?.vendor?.id, vendor.id)

  const inactiveRows = await getAdminUsersListData({ state: 'inactive', pageSize: 10 })
  assert.equal(inactiveRows.pagination.totalUsers, 1)
  assert.equal(inactiveRows.users[0]?.id, bob.id)
})

test('getAdminUsersListData rejects unsupported admin sub-roles', async () => {
  await createAdmin('ADMIN_CATALOG')

  await assert.rejects(
    () => getAdminUsersListData({ pageSize: 10 }),
    /NEXT_REDIRECT|redirect/i,
  )
})
