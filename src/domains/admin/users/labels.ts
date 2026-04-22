import { UserRole } from '@/generated/prisma/enums'
import type {
  AdminUsersEmailVerificationFilter,
  AdminUsersListStateFilter,
  AdminUsersRoleFilter,
  AdminUsersVendorFilter,
} from './queries'

export const ADMIN_USERS_ROLE_LABELS: Record<AdminUsersRoleFilter, string> = {
  all: 'Todos',
  CUSTOMER: 'Cliente',
  VENDOR: 'Productor',
  ADMIN_SUPPORT: 'Admin soporte',
  ADMIN_CATALOG: 'Admin catálogo',
  ADMIN_FINANCE: 'Admin finanzas',
  ADMIN_OPS: 'Admin operaciones',
  SUPERADMIN: 'Superadmin',
}

export const ADMIN_USERS_STATE_LABELS: Record<AdminUsersListStateFilter, string> = {
  all: 'Todos',
  active: 'Activo',
  inactive: 'Inactivo',
  deleted: 'Eliminado',
}

export const ADMIN_USERS_VENDOR_LABELS: Record<AdminUsersVendorFilter, string> = {
  all: 'Todos',
  'with-vendor': 'Con productor',
  'without-vendor': 'Sin productor',
}

export const ADMIN_USERS_EMAIL_VERIFICATION_LABELS: Record<AdminUsersEmailVerificationFilter, string> = {
  all: 'Todos',
  verified: 'Verificado',
  unverified: 'Pendiente',
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
