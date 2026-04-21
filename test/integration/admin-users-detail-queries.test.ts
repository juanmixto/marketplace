import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { getAdminUserDetailData } from '@/domains/admin'
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

test('getAdminUserDetailData returns a safe detail contract for a customer', async () => {
  await createAdmin('ADMIN_SUPPORT')

  const customer = await createCustomer({
    email: 'customer.detail@test.local',
    firstName: 'Customer',
    lastName: 'Detail',
    isActive: true,
    emailVerified: null,
  })

  const detail = await getAdminUserDetailData(customer.id)

  assert.equal(detail.user.id, customer.id)
  assert.equal(detail.user.email, customer.email)
  assert.equal(detail.user.emailMasked.includes('@'), true)
  assert.equal(detail.user.vendor, null)
  assert.equal(detail.activity.lastLoginAt, null)
  assert.equal(detail.activity.lastActivityAt, null)
  assert.equal('passwordHash' in detail.user, false)
  assert.equal('sessions' in detail.user, false)
})

test('getAdminUserDetailData includes vendor context when the user is a producer', async () => {
  await createAdmin('ADMIN_SUPPORT')

  const { user, vendor } = await createVendorFixture()

  const detail = await getAdminUserDetailData(user.id)

  assert.equal(detail.user.id, user.id)
  assert.equal(detail.user.role, 'VENDOR')
  assert.equal(detail.user.vendor?.id, vendor.id)
  assert.equal(detail.user.vendor?.displayName, 'Vendor Support')
  assert.equal(detail.user.vendor?.stripeOnboarded, true)
  assert.equal(detail.activity.lastLoginAt, null)
})

test('getAdminUserDetailData rejects unsupported admin sub-roles', async () => {
  await createAdmin('ADMIN_CATALOG')

  await assert.rejects(
    () => getAdminUserDetailData('missing-user-id'),
    /NEXT_REDIRECT|redirect/i,
  )
})
