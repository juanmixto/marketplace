import test from 'node:test'
import assert from 'node:assert/strict'
import { UserRole } from '@/generated/prisma/enums'
import { ADMIN_ROLES, hasRole, isAdmin, isVendor, VENDOR_ROLES } from '@/lib/roles'

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
