import type { Prisma } from '@/generated/prisma/client'
import { UserRole } from '@/generated/prisma/enums'
import { db } from '@/lib/db'
import { requireAdminUsersRead } from '@/lib/auth-guard'
import {
  ADMIN_USER_SUPPORT_USER_SELECT,
  buildAdminUserSupportView,
  type AdminUserSupportView,
} from './privacy'

export type AdminUsersListStateFilter = 'all' | 'active' | 'inactive' | 'deleted'
export type AdminUsersVendorFilter = 'all' | 'with-vendor' | 'without-vendor'
export type AdminUsersEmailVerificationFilter = 'all' | 'verified' | 'unverified'
export type AdminUsersRoleFilter = UserRole | 'all'

export interface AdminUsersListFilters {
  q?: string
  role?: AdminUsersRoleFilter
  state?: AdminUsersListStateFilter
  vendor?: AdminUsersVendorFilter
  emailVerification?: AdminUsersEmailVerificationFilter
  page?: number
  pageSize?: number
}

export interface AdminUsersListRow extends AdminUserSupportView {
  lastLoginAt: Date | null
  lastActivityAt: Date | null
}

export interface AdminUsersListResult {
  filters: Required<Omit<AdminUsersListFilters, 'q'>> & Pick<AdminUsersListFilters, 'q'>
  users: AdminUsersListRow[]
  pagination: {
    page: number
    pageSize: number
    totalUsers: number
    totalPages: number
  }
}

function buildUserWhere(filters: AdminUsersListFilters): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {}
  const q = filters.q?.trim()

  if (q) {
    where.OR = [
      { id: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { vendor: { is: { displayName: { contains: q, mode: 'insensitive' } } } },
      { vendor: { is: { slug: { contains: q, mode: 'insensitive' } } } },
    ]
  }

  if (filters.role && filters.role !== 'all') {
    where.role = filters.role
  }

  switch (filters.state ?? 'all') {
    case 'active':
      where.isActive = true
      where.deletedAt = null
      break
    case 'inactive':
      where.isActive = false
      where.deletedAt = null
      break
    case 'deleted':
      where.deletedAt = { not: null }
      break
    case 'all':
    default:
      break
  }

  switch (filters.vendor ?? 'all') {
    case 'with-vendor':
      where.vendor = { isNot: null }
      break
    case 'without-vendor':
      where.vendor = { is: null }
      break
    case 'all':
    default:
      break
  }

  switch (filters.emailVerification ?? 'all') {
    case 'verified':
      where.emailVerified = { not: null }
      break
    case 'unverified':
      where.emailVerified = null
      break
    case 'all':
    default:
      break
  }

  return where
}

function normalizePage(page: number | undefined) {
  return Math.max(page ?? 1, 1)
}

function normalizePageSize(pageSize: number | undefined) {
  return Math.min(Math.max(pageSize ?? 25, 1), 100)
}

export async function getAdminUsersListData(
  filters: AdminUsersListFilters = {}
): Promise<AdminUsersListResult> {
  await requireAdminUsersRead()

  const page = normalizePage(filters.page)
  const pageSize = normalizePageSize(filters.pageSize)
  const where = buildUserWhere(filters)

  const [users, totalUsers] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
      take: pageSize,
      skip: (page - 1) * pageSize,
      select: ADMIN_USER_SUPPORT_USER_SELECT,
    }),
    db.user.count({ where }),
  ])

  return {
    filters: {
      q: filters.q,
      role: filters.role ?? 'all',
      state: filters.state ?? 'all',
      vendor: filters.vendor ?? 'all',
      emailVerification: filters.emailVerification ?? 'all',
      page,
      pageSize,
    },
    users: users.map(user => ({
      ...buildAdminUserSupportView(user),
      lastLoginAt: null,
      lastActivityAt: null,
    })),
    pagination: {
      page,
      pageSize,
      totalUsers,
      totalPages: Math.max(1, Math.ceil(totalUsers / pageSize)),
    },
  }
}
