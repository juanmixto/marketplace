import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { Prisma } from '@/generated/prisma/client'

export const metadata: Metadata = { title: 'Usuarios | Admin' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    q?: string
    role?: string
    status?: string
  }>
}

const ROLE_OPTIONS = [
  { value: 'ALL', label: 'Todos' },
  { value: 'CUSTOMER', label: 'Clientes' },
  { value: 'VENDOR', label: 'Vendedores' },
  { value: 'ADMIN_SUPPORT', label: 'Support' },
  { value: 'ADMIN_CATALOG', label: 'Catálogo' },
  { value: 'ADMIN_FINANCE', label: 'Finanzas' },
  { value: 'ADMIN_OPS', label: 'Ops' },
  { value: 'SUPERADMIN', label: 'Superadmin' },
] as const

type AdminUserRole = Exclude<(typeof ROLE_OPTIONS)[number]['value'], 'ALL'>

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Todos' },
  { value: 'ACTIVE', label: 'Activos' },
  { value: 'INACTIVE', label: 'Inactivos' },
  { value: 'DELETED', label: 'Eliminados' },
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

function roleLabel(role: string): string {
  switch (role) {
    case 'CUSTOMER':
      return 'Cliente'
    case 'VENDOR':
      return 'Vendedor'
    case 'ADMIN_SUPPORT':
      return 'Support'
    case 'ADMIN_CATALOG':
      return 'Catálogo'
    case 'ADMIN_FINANCE':
      return 'Finanzas'
    case 'ADMIN_OPS':
      return 'Ops'
    case 'SUPERADMIN':
      return 'Superadmin'
    default:
      return role
  }
}

function statusBadge(user: { isActive: boolean; deletedAt: Date | null }) {
  if (user.deletedAt) return <Badge variant="red">Eliminado</Badge>
  if (!user.isActive) return <Badge variant="amber">Inactivo</Badge>
  return <Badge variant="green">Activo</Badge>
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  await requireAdmin()

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

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-2xl border border-[var(--border)] shadow-sm">
        <CardHeader className="flex flex-col gap-4 border-b border-[var(--border)] bg-[var(--surface)] lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                Gestión
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
                Usuarios
              </h1>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Cuenta de usuarios, roles y estado de acceso.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{total} resultados</Badge>
              <Badge variant="green">{activeCount} activos</Badge>
              <Badge variant="default">{adminCount} admins</Badge>
            </div>
          </div>

          <form className="grid gap-2 sm:grid-cols-3" action="/admin/usuarios" method="get">
            <label className="block text-xs">
              <span className="block font-medium text-[var(--muted-foreground)]">Buscar</span>
              <input
                name="q"
                defaultValue={q}
                placeholder="Email o nombre"
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="block font-medium text-[var(--muted-foreground)]">Rol</span>
              <select
                name="role"
                defaultValue={role}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="block font-medium text-[var(--muted-foreground)]">Estado</span>
              <select
                name="status"
                defaultValue={status}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-3 flex justify-end">
              <button
                type="submit"
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-raised)]"
              >
                Filtrar
              </button>
            </div>
          </form>
        </CardHeader>

        <CardBody className="p-0">
          <div className="overflow-x-auto">
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
                  <th className="px-5 py-4 font-medium">Usuario</th>
                  <th className="px-5 py-4 font-medium">Rol</th>
                  <th className="px-5 py-4 font-medium">Estado</th>
                  <th className="px-5 py-4 font-medium">Verificado</th>
                  <th className="px-5 py-4 font-medium">Alta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-14 text-center text-[var(--muted-foreground)]">
                      No hay usuarios para esos filtros.
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
                      <Badge variant="outline">{roleLabel(user.role)}</Badge>
                    </td>
                    <td className="px-5 py-4 align-top">{statusBadge(user)}</td>
                    <td className="px-5 py-4 align-top text-[var(--muted-foreground)]">
                      {user.emailVerified ? formatDate(user.emailVerified) : 'Pendiente'}
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
