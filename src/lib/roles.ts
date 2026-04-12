import { UserRole } from '@/generated/prisma/enums'

export const ALL_USER_ROLES: readonly UserRole[] = [
  UserRole.CUSTOMER,
  UserRole.VENDOR,
  UserRole.ADMIN_SUPPORT,
  UserRole.ADMIN_CATALOG,
  UserRole.ADMIN_FINANCE,
  UserRole.ADMIN_OPS,
  UserRole.SUPERADMIN,
]

/**
 * Narrows an unknown value to a valid UserRole, returning CUSTOMER as a
 * safe fallback for anything we do not recognise. Intended for trust
 * boundaries (JWT claims, session tokens) where the incoming role string
 * must be validated before being used for authorization decisions.
 */
export function coerceUserRole(role: unknown): UserRole {
  if (typeof role !== 'string') return UserRole.CUSTOMER
  return (ALL_USER_ROLES as readonly string[]).includes(role)
    ? (role as UserRole)
    : UserRole.CUSTOMER
}

export const ADMIN_ROLES: readonly UserRole[] = [
  UserRole.ADMIN_SUPPORT,
  UserRole.ADMIN_CATALOG,
  UserRole.ADMIN_FINANCE,
  UserRole.ADMIN_OPS,
  UserRole.SUPERADMIN,
]

export const VENDOR_ROLES: readonly UserRole[] = [UserRole.VENDOR]

export const OPS_ADMIN_ROLES: readonly UserRole[] = [
  UserRole.ADMIN_OPS,
  UserRole.SUPERADMIN,
]

export const FINANCE_ADMIN_ROLES: readonly UserRole[] = [
  UserRole.ADMIN_FINANCE,
  UserRole.ADMIN_OPS,
  UserRole.SUPERADMIN,
]

export function hasRole<Role extends UserRole>(
  role: UserRole | null | undefined,
  allowedRoles: readonly Role[]
): role is Role {
  return !!role && allowedRoles.includes(role as Role)
}

export function isAdminRole(role?: UserRole | null): role is typeof ADMIN_ROLES[number] {
  return hasRole(role, ADMIN_ROLES)
}

export function isVendorRole(role?: UserRole | null): role is typeof UserRole.VENDOR {
  return hasRole(role, VENDOR_ROLES)
}

export function isOpsAdminRole(role?: UserRole | null): role is typeof OPS_ADMIN_ROLES[number] {
  return hasRole(role, OPS_ADMIN_ROLES)
}

export function isFinanceAdminRole(role?: UserRole | null): role is typeof FINANCE_ADMIN_ROLES[number] {
  return hasRole(role, FINANCE_ADMIN_ROLES)
}

export const isAdmin = isAdminRole
export const isVendor = isVendorRole
