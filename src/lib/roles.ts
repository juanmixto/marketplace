import { UserRole } from '@/generated/prisma/enums'

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
