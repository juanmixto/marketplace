import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { refreshSessionClaimsFromDb } from '@/lib/auth'
import { resetIntegrationDatabase } from './helpers'

beforeEach(async () => {
  await resetIntegrationDatabase()
})

test('refreshSessionClaimsFromDb bootstraps authVersion for legacy tokens', async () => {
  const user = await db.user.create({
    data: {
      email: `revocation-${Date.now()}@example.com`,
      firstName: 'Auth',
      lastName: 'Test',
      passwordHash: 'hash',
      role: 'ADMIN_OPS',
      isActive: true,
    },
  })

  const token = await refreshSessionClaimsFromDb({
    id: user.id,
    role: 'CUSTOMER',
  } as never)

  assert.equal(token.authVersion, 0)
  assert.equal(token.isActive, true)
  assert.equal(token.role, 'ADMIN_OPS')
})

test('refreshSessionClaimsFromDb invalidates stale tokens after authVersion bump', async () => {
  const user = await db.user.create({
    data: {
      email: `revocation-${Date.now()}@example.com`,
      firstName: 'Auth',
      lastName: 'Test',
      passwordHash: 'hash',
      role: 'ADMIN_OPS',
      isActive: true,
    },
  })

  const staleToken = await refreshSessionClaimsFromDb({
    id: user.id,
    role: 'ADMIN_OPS',
    authVersion: 0,
  } as never)

  assert.equal(staleToken.isActive, true)
  assert.equal(staleToken.authVersion, 0)

  await db.user.update({
    where: { id: user.id },
    data: { authVersion: { increment: 1 } },
  })

  const revoked = await refreshSessionClaimsFromDb({
    id: user.id,
    role: 'ADMIN_OPS',
    authVersion: 0,
  } as never)

  assert.equal(revoked.isActive, false)
  assert.equal(revoked.authVersion, 0)
})

test('refreshSessionClaimsFromDb invalidates inactive users', async () => {
  const user = await db.user.create({
    data: {
      email: `inactive-${Date.now()}@example.com`,
      firstName: 'Auth',
      lastName: 'Test',
      passwordHash: 'hash',
      role: 'CUSTOMER',
      isActive: false,
    },
  })

  const revoked = await refreshSessionClaimsFromDb({
    id: user.id,
    role: 'CUSTOMER',
    authVersion: 0,
  } as never)

  assert.equal(revoked.isActive, false)
})
