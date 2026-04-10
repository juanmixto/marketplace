import test from 'node:test'
import assert from 'node:assert/strict'
import { UserRole } from '@/generated/prisma/enums'
import {
  ADMIN_ROLES,
  FINANCE_ADMIN_ROLES,
  OPS_ADMIN_ROLES,
  hasRole,
  isAdmin,
  isFinanceAdminRole,
  isOpsAdminRole,
  isVendor,
  VENDOR_ROLES,
} from '@/lib/roles'

test('ADMIN_ROLES contains every administrative role and excludes vendor/customer roles', () => {
  assert.deepEqual(ADMIN_ROLES, [
    UserRole.ADMIN_SUPPORT,
    UserRole.ADMIN_CATALOG,
    UserRole.ADMIN_FINANCE,
    UserRole.ADMIN_OPS,
    UserRole.SUPERADMIN,
  ])
  assert.equal(new Set(ADMIN_ROLES).size, 5)
})

test('VENDOR_ROLES only contains the vendor role', () => {
  assert.deepEqual(VENDOR_ROLES, [UserRole.VENDOR])
})

test('isAdmin and isVendor expose semantic role checks', () => {
  assert.equal(isAdmin(UserRole.ADMIN_FINANCE), true)
  assert.equal(isAdmin(UserRole.SUPERADMIN), true)
  assert.equal(isAdmin(UserRole.VENDOR), false)
  assert.equal(isVendor(UserRole.VENDOR), true)
  assert.equal(isVendor(UserRole.CUSTOMER), false)
})

test('hasRole returns false for missing roles and true for allowed roles', () => {
  assert.equal(hasRole(undefined, [UserRole.VENDOR]), false)
  assert.equal(hasRole(null, [UserRole.VENDOR]), false)
  assert.equal(hasRole(UserRole.ADMIN_OPS, [UserRole.ADMIN_OPS, UserRole.SUPERADMIN]), true)
  assert.equal(hasRole(UserRole.CUSTOMER, [UserRole.ADMIN_OPS, UserRole.SUPERADMIN]), false)
})

test('OPS_ADMIN_ROLES only contains ADMIN_OPS and SUPERADMIN', () => {
  assert.deepEqual(OPS_ADMIN_ROLES, [UserRole.ADMIN_OPS, UserRole.SUPERADMIN])
})

test('isOpsAdminRole returns true only for ops-level roles', () => {
  assert.equal(isOpsAdminRole(UserRole.ADMIN_OPS), true)
  assert.equal(isOpsAdminRole(UserRole.SUPERADMIN), true)
  assert.equal(isOpsAdminRole(UserRole.ADMIN_FINANCE), false)
  assert.equal(isOpsAdminRole(UserRole.ADMIN_SUPPORT), false)
  assert.equal(isOpsAdminRole(UserRole.VENDOR), false)
  assert.equal(isOpsAdminRole(undefined), false)
  assert.equal(isOpsAdminRole(null), false)
})

test('FINANCE_ADMIN_ROLES contains ADMIN_FINANCE, ADMIN_OPS and SUPERADMIN', () => {
  assert.deepEqual(FINANCE_ADMIN_ROLES, [
    UserRole.ADMIN_FINANCE,
    UserRole.ADMIN_OPS,
    UserRole.SUPERADMIN,
  ])
})

test('isFinanceAdminRole returns true for finance and ops-level roles', () => {
  assert.equal(isFinanceAdminRole(UserRole.ADMIN_FINANCE), true)
  assert.equal(isFinanceAdminRole(UserRole.ADMIN_OPS), true)
  assert.equal(isFinanceAdminRole(UserRole.SUPERADMIN), true)
  assert.equal(isFinanceAdminRole(UserRole.ADMIN_CATALOG), false)
  assert.equal(isFinanceAdminRole(UserRole.VENDOR), false)
  assert.equal(isFinanceAdminRole(undefined), false)
  assert.equal(isFinanceAdminRole(null), false)
})
