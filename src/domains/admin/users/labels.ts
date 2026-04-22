import { UserRole } from '@/generated/prisma/enums'
import type {
  AdminUsersEmailVerificationFilter,
  AdminUsersListStateFilter,
  AdminUsersRoleFilter,
  AdminUsersVendorFilter,
} from './queries'

export const ADMIN_USERS_ROLE_LABELS: Record<AdminUsersRoleFilter, string> = {
  all: 'All',
  CUSTOMER: 'Customer',
  VENDOR: 'Producer',
  ADMIN_SUPPORT: 'Support admin',
  ADMIN_CATALOG: 'Catalog admin',
  ADMIN_FINANCE: 'Finance admin',
  ADMIN_OPS: 'Operations admin',
  SUPERADMIN: 'Superadmin',
}

export const ADMIN_USERS_STATE_LABELS: Record<AdminUsersListStateFilter, string> = {
  all: 'All',
  active: 'Active',
  inactive: 'Inactive',
  deleted: 'Deleted',
}

export const ADMIN_USERS_VENDOR_LABELS: Record<AdminUsersVendorFilter, string> = {
  all: 'All',
  'with-vendor': 'With producer',
  'without-vendor': 'Without producer',
}

export const ADMIN_USERS_EMAIL_VERIFICATION_LABELS: Record<AdminUsersEmailVerificationFilter, string> = {
  all: 'All',
  verified: 'Verified',
  unverified: 'Pending',
}

export const ADMIN_USERS_ROLE_OPTIONS: readonly AdminUsersRoleFilter[] = [
  'all',
  UserRole.CUSTOMER,
  UserRole.VENDOR,
  UserRole.ADMIN_SUPPORT,
  UserRole.ADMIN_CATALOG,
  UserRole.ADMIN_FINANCE,
  UserRole.ADMIN_OPS,
  UserRole.SUPERADMIN,
]

export const ADMIN_USERS_STATE_OPTIONS: readonly AdminUsersListStateFilter[] = [
  'all',
  'active',
  'inactive',
  'deleted',
]

export const ADMIN_USERS_VENDOR_OPTIONS: readonly AdminUsersVendorFilter[] = [
  'all',
  'with-vendor',
  'without-vendor',
]

export const ADMIN_USERS_EMAIL_VERIFICATION_OPTIONS: readonly AdminUsersEmailVerificationFilter[] = [
  'all',
  'verified',
  'unverified',
]
