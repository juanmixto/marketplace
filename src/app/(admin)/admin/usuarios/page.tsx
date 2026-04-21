import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowPathIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getAdminUsersListData } from '@/domains/admin'
import {
  ADMIN_USERS_EMAIL_VERIFICATION_OPTIONS,
  ADMIN_USERS_ROLE_OPTIONS,
  ADMIN_USERS_STATE_OPTIONS,
  ADMIN_USERS_VENDOR_OPTIONS,
  buildAdminUsersListHref,
  parseAdminUsersSearchParams,
} from '@/domains/admin/users/navigation'
import { UserRole } from '@/generated/prisma/enums'
import { cn, formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Usuarios | Admin' }
export const revalidate = 30

const ROLE_LABELS: Record<string, string> = {
  all: 'Todos',
  CUSTOMER: 'Cliente',
  VENDOR: 'Productor',
  ADMIN_SUPPORT: 'Admin soporte',
  ADMIN_CATALOG: 'Admin catálogo',
  ADMIN_FINANCE: 'Admin finanzas',
  ADMIN_OPS: 'Admin operaciones',
  SUPERADMIN: 'Superadmin',
}

const STATE_LABELS: Record<string, string> = {
  all: 'Todos',
  active: 'Activo',
  inactive: 'Inactivo',
  deleted: 'Eliminado',
}

const VENDOR_LABELS: Record<string, string> = {
  all: 'Todos',
  'with-vendor': 'Con productor',
  'without-vendor': 'Sin productor',
}

const EMAIL_VERIFICATION_LABELS: Record<string, string> = {
  all: 'Todos',
  verified: 'Verificado',
  unverified: 'Pendiente',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function roleTone(role: UserRole): 'amber' | 'blue' | 'emerald' | 'red' | 'slate' {
  switch (role) {
    case 'VENDOR':
      return 'emerald'
    case 'ADMIN_SUPPORT':
    case 'ADMIN_CATALOG':
    case 'ADMIN_FINANCE':
    case 'ADMIN_OPS':
    case 'SUPERADMIN':
      return 'blue'
    case 'CUSTOMER':
    default:
      return 'slate'
  }
}

function stateTone(isActive: boolean, deletedAt: Date | null): 'amber' | 'blue' | 'emerald' | 'red' | 'slate' {
  if (deletedAt) return 'red'
  return isActive ? 'emerald' : 'amber'
}

function verificationTone(emailVerified: Date | null): 'amber' | 'blue' | 'emerald' | 'red' | 'slate' {
  return emailVerified ? 'emerald' : 'amber'
}

function vendorTone(hasVendor: boolean): 'amber' | 'blue' | 'emerald' | 'red' | 'slate' {
  return hasVendor ? 'blue' : 'slate'
}

function activityLabel(lastLoginAt: Date | null, lastActivityAt: Date | null) {
  if (lastLoginAt) {
    return `Último login ${formatDate(lastLoginAt, { dateStyle: 'medium', timeStyle: 'short' })}`
  }
  if (lastActivityAt) {
    return `Última actividad ${formatDate(lastActivityAt, { dateStyle: 'medium', timeStyle: 'short' })}`
  }
  return 'Sin dato fiable todavía'
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const params = await searchParams
  const filters = parseAdminUsersSearchParams({
    q: firstValue(params.q),
    role: firstValue(params.role),
    state: firstValue(params.state),
    vendor: firstValue(params.vendor),
    emailVerification: firstValue(params.emailVerification),
    page: firstValue(params.page),
  })

  const data = await getAdminUsersListData(filters)
  const pageStart = (data.pagination.page - 1) * data.pagination.pageSize
  const pageEnd = Math.min(pageStart + data.pagination.pageSize, data.pagination.totalUsers)
  const rangeStart = data.pagination.totalUsers === 0 ? 0 : pageStart + 1

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Soporte y seguridad</p>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Usuarios</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
            Listado operativo de clientes y productores con filtros, estados y contexto útil para soporte sin exponer datos innecesarios.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-right text-sm text-[var(--muted)] shadow-sm">
          <p>{data.pagination.totalUsers} usuarios en el resultado</p>
          <p>
            Página {data.pagination.page} de {data.pagination.totalPages}
          </p>
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-col gap-3 border-b border-[var(--border)] lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Buscar y filtrar</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Encuentra usuarios por email, nombre, productor asociado o rol y acota por estado o verificación.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1">
              {data.pagination.totalUsers} coincidencias
            </span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1">
              {rangeStart}-{pageEnd}
            </span>
          </div>
        </CardHeader>
        <CardBody>
          <form className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,0.85fr))_auto_auto] lg:items-end">
            <Input
              name="q"
              label="Buscar"
              defaultValue={data.filters.q ?? ''}
              placeholder="Email, nombre, productor o ID"
            />
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-[var(--foreground-soft)]">Rol</span>
              <select
                name="role"
                defaultValue={data.filters.role}
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {ADMIN_USERS_ROLE_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {ROLE_LABELS[option] ?? option}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-[var(--foreground-soft)]">Estado</span>
              <select
                name="state"
                defaultValue={data.filters.state}
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {ADMIN_USERS_STATE_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {STATE_LABELS[option] ?? option}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-[var(--foreground-soft)]">Productor</span>
              <select
                name="vendor"
                defaultValue={data.filters.vendor}
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {ADMIN_USERS_VENDOR_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {VENDOR_LABELS[option] ?? option}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-[var(--foreground-soft)]">Email</span>
              <select
                name="emailVerification"
                defaultValue={data.filters.emailVerification}
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {ADMIN_USERS_EMAIL_VERIFICATION_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {EMAIL_VERIFICATION_LABELS[option] ?? option}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="primary" size="md">
              <MagnifyingGlassIcon className="h-4 w-4" />
              Aplicar
            </Button>
            <Link
              href="/admin/usuarios"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground-soft)] shadow-sm transition-all duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Limpiar
            </Link>
          </form>
        </CardBody>
      </Card>

      <Card className="rounded-2xl">
        <div className="overflow-x-auto overscroll-x-contain touch-pan-x">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-[var(--background)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted-light)]">
              <tr>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Alta</th>
                <th className="px-4 py-3">Actividad</th>
                <th className="px-4 py-3">Productor</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {data.users.map(user => (
                <tr key={user.id} className="transition hover:bg-[var(--surface-raised)]/70">
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-[var(--foreground)]">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-xs text-[var(--muted)]">{user.id}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <AdminStatusBadge label={ROLE_LABELS[user.role] ?? user.role} tone={roleTone(user.role)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <AdminStatusBadge
                        label={user.deletedAt ? STATE_LABELS.deleted : user.isActive ? STATE_LABELS.active : STATE_LABELS.inactive}
                        tone={stateTone(user.isActive, user.deletedAt)}
                      />
                      <AdminStatusBadge
                        label={user.emailVerified ? 'Email verificado' : 'Email pendiente'}
                        tone={verificationTone(user.emailVerified)}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="font-medium text-[var(--foreground)]">{user.email}</p>
                      <p className="text-xs text-[var(--muted)]">{user.emailMasked}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--foreground-soft)]">
                    {formatDate(user.createdAt, { dateStyle: 'medium' })}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[var(--foreground-soft)]">
                      {activityLabel(user.lastLoginAt, user.lastActivityAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {user.vendor ? (
                      <div className="space-y-1">
                        <AdminStatusBadge label={user.vendor.displayName} tone={vendorTone(true)} />
                        <p className="text-xs text-[var(--muted)]">
                          {user.vendor.status} · {user.vendor.slug}
                        </p>
                      </div>
                    ) : (
                      <AdminStatusBadge label="Sin productor" tone={vendorTone(false)} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/usuarios/${user.id}`}
                      className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--foreground-soft)] shadow-sm transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
                    >
                      Ver ficha
                    </Link>
                  </td>
                </tr>
              ))}
              {data.users.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center">
                    <p className="font-medium text-[var(--foreground)]">No hay usuarios para este filtro.</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Ajusta la búsqueda o limpia los filtros para ver más resultados.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--muted)]">
            <span>
              Mostrando {rangeStart}-{pageEnd} de {data.pagination.totalUsers} usuarios.
            </span>
            <div className="flex items-center gap-2">
              <Link
                href={buildAdminUsersListHref(data.filters, data.pagination.page - 1)}
                aria-disabled={data.pagination.page <= 1}
                className={cn(
                  'inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-3 font-medium',
                  data.pagination.page <= 1
                    ? 'pointer-events-none opacity-50'
                    : 'bg-[var(--surface)] text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]'
                )}
              >
                Anterior
              </Link>
              <span>
                Página {data.pagination.page} de {data.pagination.totalPages}
              </span>
              <Link
                href={buildAdminUsersListHref(data.filters, data.pagination.page + 1)}
                aria-disabled={data.pagination.page >= data.pagination.totalPages}
                className={cn(
                  'inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-3 font-medium',
                  data.pagination.page >= data.pagination.totalPages
                    ? 'pointer-events-none opacity-50'
                    : 'bg-[var(--surface)] text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]'
                )}
              >
                Siguiente
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
