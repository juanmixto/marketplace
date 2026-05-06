import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { Prisma } from '@/generated/prisma/client'
import { getServerLocale } from '@/i18n/server'
import { getAdminUsersCopy } from '@/i18n/admin-users-copy'
import { auditAdminSearch } from '@/domains/admin/search-pii'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    q?: string
    role?: string
    status?: string
  }>
}

const ROLE_OPTIONS = [
  { value: 'ALL' },
  { value: 'CUSTOMER' },
  { value: 'VENDOR' },
  { value: 'ADMIN_SUPPORT' },
  { value: 'ADMIN_CATALOG' },
  { value: 'ADMIN_FINANCE' },
  { value: 'ADMIN_OPS' },
  { value: 'SUPERADMIN' },
] as const

type AdminUserRole = Exclude<(typeof ROLE_OPTIONS)[number]['value'], 'ALL'>

const STATUS_OPTIONS = [
  { value: 'ALL' },
  { value: 'ACTIVE' },
  { value: 'INACTIVE' },
  { value: 'DELETED' },
] as const

function parseRole(value: string | undefined): AdminUserRole | 'ALL' {
  const allowed = new Set(ROLE_OPTIONS.map((option) => option.value))
  return allowed.has(value as (typeof ROLE_OPTIONS)[number]['value'])
    ? (value as AdminUserRole | 'ALL')
    : 'ALL'
}

function parseStatus(value: string | undefined) {
  const allowed = new Set(STATUS_OPTIONS.map((option) => option.value))
  return allowed.has(value as (typeof STATUS_OPTIONS)[number]['value']) ? value : 'ALL'
}

function statusBadge(
  user: { isActive: boolean; deletedAt: Date | null },
  copy: ReturnType<typeof getAdminUsersCopy>['list']
) {
  if (user.deletedAt) return <Badge variant="red">{copy.statuses.DELETED}</Badge>
  if (!user.isActive) return <Badge variant="amber">{copy.statuses.INACTIVE}</Badge>
  return <Badge variant="green">{copy.statuses.ACTIVE}</Badge>
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return { title: getAdminUsersCopy(locale).list.metadataTitle }
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const session = await requireAdmin()
  const locale = await getServerLocale()
  const copy = getAdminUsersCopy(locale).list

  const sp = await searchParams
  const q = sp.q?.trim() ?? ''
  const role = parseRole(sp.role)
  const status = parseStatus(sp.status)

  const where: Prisma.UserWhereInput = {}
  if (q) {
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
    ]
  }
  if (role !== 'ALL') where.role = role
  if (status === 'ACTIVE') where.isActive = true
  if (status === 'INACTIVE') where.isActive = false
  if (status === 'DELETED') where.deletedAt = { not: null }

  const [users, total, activeCount, adminCount] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        deletedAt: true,
        emailVerified: true,
        createdAt: true,
      },
    }),
    db.user.count({ where }),
    db.user.count({ where: { isActive: true } }),
    db.user.count({ where: { role: { in: ['ADMIN_SUPPORT', 'ADMIN_CATALOG', 'ADMIN_FINANCE', 'ADMIN_OPS', 'SUPERADMIN'] } } }),
  ])

  // #1353 — admins can search Users by email / firstName / lastName.
  // The `q` field is THE most enumeration-sensitive surface in the
  // whole admin panel: a curious operator typing `@gmail.com` or a
  // partial first name can browse the customer base. Hash-only audit
  // (the literal email never enters AuditLog — only its sha256).
  if (q) {
    await auditAdminSearch({
      scope: 'admin-users',
      actorId: session.user.id,
      actorRole: session.user.role,
      query: q,
      matchedCount: total,
    })
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-2xl border border-[var(--border)] shadow-sm">
        <CardHeader className="flex flex-col gap-4 border-b border-[var(--border)] bg-[var(--surface)] lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                {copy.eyebrow}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
                {copy.title}
              </h1>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {copy.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{copy.badges.results(total)}</Badge>
              <Badge variant="green">{copy.badges.active(activeCount)}</Badge>
              <Badge variant="default">{copy.badges.admins(adminCount)}</Badge>
            </div>
          </div>

          <form className="grid gap-2 sm:grid-cols-3" action="/admin/usuarios" method="get">
            <label className="block text-xs">
              <span className="block font-medium text-[var(--muted-foreground)]">{copy.search.label}</span>
              <input
                name="q"
                defaultValue={q}
                placeholder={copy.search.placeholder}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="block font-medium text-[var(--muted-foreground)]">{copy.filters.role}</span>
              <select
                name="role"
                defaultValue={role}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {copy.roles[option.value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="block font-medium text-[var(--muted-foreground)]">{copy.filters.status}</span>
              <select
                name="status"
                defaultValue={status}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {copy.statuses[option.value]}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-3 flex justify-end">
              <button
                type="submit"
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-raised)]"
              >
                {copy.filters.submit}
              </button>
            </div>
          </form>
        </CardHeader>

        <CardBody className="p-0">
          <div className="overflow-x-auto overscroll-x-contain touch-pan-x">
            <table className="min-w-[920px] w-full table-fixed text-sm">
              <colgroup>
                <col />
                <col className="w-[11rem]" />
                <col className="w-[10rem]" />
                <col className="w-[9rem]" />
                <col className="w-[11rem]" />
              </colgroup>
              <thead className="bg-[var(--muted)]/40 text-left text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-5 py-4 font-medium">{copy.table.user}</th>
                  <th className="px-5 py-4 font-medium">{copy.table.role}</th>
                  <th className="px-5 py-4 font-medium">{copy.table.status}</th>
                  <th className="px-5 py-4 font-medium">{copy.table.verified}</th>
                  <th className="px-5 py-4 font-medium">{copy.table.joined}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-14 text-center text-[var(--muted-foreground)]">
                      {copy.table.empty}
                    </td>
                  </tr>
                )}
                {users.map((user) => (
                  <tr key={user.id} className="transition-colors hover:bg-[var(--muted)]/25">
                    <td className="px-5 py-4 align-top">
                      <Link href={`/admin/usuarios/${user.id}`} className="block font-medium text-[var(--foreground)] hover:underline">
                        {user.firstName} {user.lastName}
                      </Link>
                      <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{user.email}</p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <Badge variant="outline">{copy.roleLabels[user.role as AdminUserRole] ?? user.role}</Badge>
                    </td>
                    <td className="px-5 py-4 align-top">{statusBadge(user, copy)}</td>
                    <td className="px-5 py-4 align-top text-[var(--muted-foreground)]">
                      {user.emailVerified ? formatDate(user.emailVerified) : copy.pending}
                    </td>
                    <td className="px-5 py-4 align-top text-[var(--muted-foreground)]">{formatDate(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
