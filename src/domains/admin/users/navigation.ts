import { UserRole } from '@/generated/prisma/enums'
import type {
  AdminUsersEmailVerificationFilter,
  AdminUsersListFilters,
  AdminUsersListStateFilter,
  AdminUsersRoleFilter,
  AdminUsersVendorFilter,
} from './queries'

export interface AdminUsersSearchParamsInput {
  q?: string | null
  role?: string | null
  state?: string | null
  vendor?: string | null
  emailVerification?: string | null
  page?: string | null
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

function normalizePage(value: string | null | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(parsed, 1) : 1
}

function normalizeOption<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  if (!value) return fallback
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

export function parseAdminUsersSearchParams(
  params: AdminUsersSearchParamsInput = {}
): AdminUsersListFilters {
  const q = params.q?.trim() ?? ''
  const role = normalizeOption(params.role, ADMIN_USERS_ROLE_OPTIONS, 'all')
  const state = normalizeOption(params.state, ADMIN_USERS_STATE_OPTIONS, 'all')
  const vendor = normalizeOption(params.vendor, ADMIN_USERS_VENDOR_OPTIONS, 'all')
  const emailVerification = normalizeOption(
    params.emailVerification,
    ADMIN_USERS_EMAIL_VERIFICATION_OPTIONS,
    'all'
  )

  return {
    q: q || undefined,
    role,
    state,
    vendor,
    emailVerification,
    page: normalizePage(params.page),
  }
}

export interface AdminUsersListHrefFilters {
  q?: string | null
  role?: AdminUsersRoleFilter
  state?: AdminUsersListStateFilter
  vendor?: AdminUsersVendorFilter
  emailVerification?: AdminUsersEmailVerificationFilter
}

export function buildAdminUsersListHref(
  filters: AdminUsersListHrefFilters = {},
  page = 1
): string {
  const params = new URLSearchParams()
  const q = filters.q?.trim()
  if (q) params.set('q', q)
  if (filters.role && filters.role !== 'all') params.set('role', filters.role)
  if (filters.state && filters.state !== 'all') params.set('state', filters.state)
  if (filters.vendor && filters.vendor !== 'all') params.set('vendor', filters.vendor)
  if (filters.emailVerification && filters.emailVerification !== 'all') {
    params.set('emailVerification', filters.emailVerification)
  }
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `/admin/usuarios?${query}` : '/admin/usuarios'
}
