import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { requestAdminUserPasswordReset } from '@/domains/admin'
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

async function createCustomer(email: string, overrides: Record<string, unknown> = {}) {
  return db.user.create({
    data: {
      email,
      firstName: 'Customer',
      lastName: 'Reset',
      role: 'CUSTOMER',
      isActive: true,
      passwordHash: 'hash',
      ...overrides,
    },
  })
}

test('requestAdminUserPasswordReset issues a token, audits the request and masks the response', async () => {
  await createAdmin('ADMIN_SUPPORT')
  const user = await createCustomer('reset.target@test.local', { emailVerified: new Date() })

  const result = await requestAdminUserPasswordReset(user.id)

  assert.equal(result.userId, user.id)
  assert.equal(result.emailMasked.includes('@'), true)

  const tokenRows = await db.passwordResetToken.findMany({ where: { userId: user.id } })
  assert.equal(tokenRows.length, 1)
  assert.equal(tokenRows[0]?.usedAt, null)

  const auditRow = await db.auditLog.findFirst({
    where: { action: 'ADMIN_USER_PASSWORD_RESET_REQUESTED', entityId: user.id },
    orderBy: { createdAt: 'desc' },
  })
  assert.ok(auditRow)
  assert.equal(auditRow?.entityType, 'User')
})

test('requestAdminUserPasswordReset rejects unsupported admin sub-roles', async () => {
  await createAdmin('ADMIN_CATALOG')
  const user = await createCustomer('reset.denied@test.local')

  await assert.rejects(
    () => requestAdminUserPasswordReset(user.id),
    /NEXT_REDIRECT|redirect/i,
  )
})

test('requestAdminUserPasswordReset rejects deleted accounts', async () => {
  await createAdmin('ADMIN_SUPPORT')
  const user = await createCustomer('reset.deleted@test.local', {
    deletedAt: new Date(),
    isActive: false,
  })

  await assert.rejects(
    () => requestAdminUserPasswordReset(user.id),
    /deleted account/i,
  )
})
