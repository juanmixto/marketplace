import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { UserRole } from '@/generated/prisma/enums'
import {
  ADMIN_USERS_PASSWORD_RESET_ROLES,
  ADMIN_USERS_READ_ROLES,
  ADMIN_USERS_STATE_CHANGE_ROLES,
  canAccessAdminUsers,
  canChangeAdminUserState,
  canResetAdminUserPassword,
} from '@/lib/roles'
import {
  requireAdminUsersRead,
  requireAdminUsersResetPassword,
  requireAdminUsersStateChange,
} from '@/lib/auth-guard'
import { resetTestActionSession, setTestActionSession } from '@/lib/action-session'

process.env.NODE_ENV = 'test'

const ALLOWED_READ: UserRole[] = ['ADMIN_SUPPORT', 'ADMIN_OPS', 'SUPERADMIN']
const ALLOWED_RESET: UserRole[] = ['ADMIN_SUPPORT', 'ADMIN_OPS', 'SUPERADMIN']
const ALLOWED_STATE: UserRole[] = ['ADMIN_OPS', 'SUPERADMIN']
const DENIED_READ = ['ADMIN_CATALOG', 'ADMIN_FINANCE', 'CUSTOMER', 'VENDOR'] as const

function useRole(role: UserRole) {
  setTestActionSession({
    user: {
      id: `user-${role.toLowerCase()}`,
      role,
      email: `${role.toLowerCase()}@example.com`,
      name: role,
    },
  })
}

afterEach(() => {
  resetTestActionSession()
})

test('admin users RBAC role matrices are explicit and minimal', () => {
  assert.deepEqual([...ADMIN_USERS_READ_ROLES], ALLOWED_READ)
  assert.deepEqual([...ADMIN_USERS_PASSWORD_RESET_ROLES], ALLOWED_RESET)
  assert.deepEqual([...ADMIN_USERS_STATE_CHANGE_ROLES], ALLOWED_STATE)
})

test('canAccessAdminUsers only allows support / ops / superadmin', () => {
  for (const role of ALLOWED_READ) {
    assert.equal(canAccessAdminUsers(role), true, `${role} should read admin users`)
  }

  for (const role of DENIED_READ) {
    assert.equal(canAccessAdminUsers(role), false, `${role} should not read admin users`)
  }
})

test('canResetAdminUserPassword only allows support / ops / superadmin', () => {
  for (const role of ALLOWED_RESET) {
    assert.equal(canResetAdminUserPassword(role), true, `${role} should reset passwords`)
  }

  for (const role of DENIED_READ) {
    assert.equal(canResetAdminUserPassword(role), false, `${role} should not reset passwords`)
  }
})

test('canChangeAdminUserState only allows ops / superadmin', () => {
  for (const role of ALLOWED_STATE) {
    assert.equal(canChangeAdminUserState(role), true, `${role} should change user state`)
  }

  for (const role of ['ADMIN_SUPPORT', 'ADMIN_CATALOG', 'ADMIN_FINANCE', 'CUSTOMER', 'VENDOR'] as const) {
    assert.equal(canChangeAdminUserState(role), false, `${role} should not change user state`)
  }
})

test('requireAdminUsersRead rejects unsupported roles', async () => {
  useRole('ADMIN_CATALOG')
  await assert.rejects(() => requireAdminUsersRead(), /NEXT_REDIRECT|redirect/i)
})

test('requireAdminUsersRead allows supported roles', async () => {
  useRole('ADMIN_SUPPORT')
  const session = await requireAdminUsersRead()
  assert.equal(session.user.role, 'ADMIN_SUPPORT')
})

test('requireAdminUsersResetPassword rejects unsupported roles', async () => {
  useRole('ADMIN_CATALOG')
  await assert.rejects(() => requireAdminUsersResetPassword(), /NEXT_REDIRECT|redirect/i)
})

test('requireAdminUsersStateChange rejects support and allows ops', async () => {
  useRole('ADMIN_SUPPORT')
  await assert.rejects(() => requireAdminUsersStateChange(), /NEXT_REDIRECT|redirect/i)

  useRole('ADMIN_OPS')
  const session = await requireAdminUsersStateChange()
  assert.equal(session.user.role, 'ADMIN_OPS')
})
