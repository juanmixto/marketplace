import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Auditoria | Admin' }
export const revalidate = 30

interface PageProps {
  searchParams?: Promise<{ action?: string; entityType?: string }> | { action?: string; entityType?: string }
}

export default async function AdminAuditPage({ searchParams }: PageProps) {
  const filters = await Promise.resolve(searchParams ?? {})
  const actionFilter = filters.action?.trim()
  const entityTypeFilter = filters.entityType?.trim()

  const where = {
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(entityTypeFilter ? { entityType: entityTypeFilter } : {}),
  }

  const [logs, actionGroups, entityGroups] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.auditLog.groupBy({
      by: ['action'],
      _count: { _all: true },
      orderBy: { action: 'asc' },
    }),
    db.auditLog.groupBy({
      by: ['entityType'],
      _count: { _all: true },
      orderBy: { entityType: 'asc' },
    }),
  ])

  const actorIds = Array.from(new Set(logs.map(log => log.actorId)))
  const users = actorIds.length > 0
    ? await db.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    })
    : []
  const usersById = new Map(users.map(user => [user.id, user]))

  const inputCls = 'w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500'

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Seguridad</p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Auditoria</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Historial de acciones administrativas y cambios sensibles.</p>
      </div>

      <form className="grid gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 md:grid-cols-[1fr,1fr,auto]">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--foreground)]">Accion</span>
          <select
            name="action"
            defaultValue={actionFilter ?? ''}
            className={inputCls}
          >
            <option value="">Todas</option>
            {actionGroups.map(group => (
              <option key={group.action} value={group.action}>
                {group.action} ({group._count._all})
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--foreground)]">Entidad</span>
          <select
            name="entityType"
            defaultValue={entityTypeFilter ?? ''}
            className={inputCls}
          >
            <option value="">Todas</option>
            {entityGroups.map(group => (
              <option key={group.entityType} value={group.entityType}>
                {group.entityType} ({group._count._all})
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-xl bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] hover:opacity-90">
            Filtrar
          </button>
          <a href="/admin/auditoria" className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]">
            Limpiar
          </a>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="grid grid-cols-[1.1fr,0.9fr,0.8fr,1fr,0.9fr,1.2fr] gap-4 border-b border-[var(--border)] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          <span>Fecha</span>
          <span>Accion</span>
          <span>Entidad</span>
          <span>Actor</span>
          <span>IP</span>
          <span>Cambio</span>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {logs.map(log => {
            const actor = usersById.get(log.actorId)

            return (
              <div key={log.id} className="grid grid-cols-[1.1fr,0.9fr,0.8fr,1fr,0.9fr,1.2fr] gap-4 px-5 py-4 text-sm">
                <div>
                  <p className="font-medium text-[var(--foreground)]">{formatDate(log.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  <p className="text-xs text-[var(--muted)]">{log.entityId}</p>
                </div>
                <div className="font-medium text-[var(--foreground)]">{log.action}</div>
                <div>
                  <p className="font-medium text-[var(--foreground)]">{log.entityType}</p>
                </div>
                <div>
                  <p className="font-medium text-[var(--foreground)]">
                    {actor ? `${actor.firstName} ${actor.lastName}` : log.actorId}
                  </p>
                  <p className="text-xs text-[var(--muted)]">{actor?.email ?? log.actorRole}</p>
                </div>
                <div className="text-[var(--foreground-soft)]">{log.ip ?? 'N/D'}</div>
                <div className="space-y-1 text-xs text-[var(--foreground-soft)]">
                  {log.before && (
                    <p className="line-clamp-2">
                      <span className="font-semibold text-[var(--foreground)]">Antes:</span> {JSON.stringify(log.before)}
                    </p>
                  )}
                  {log.after && (
                    <p className="line-clamp-2">
                      <span className="font-semibold text-[var(--foreground)]">Despues:</span> {JSON.stringify(log.after)}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
          {logs.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-[var(--muted)]">
              No hay eventos de auditoria para los filtros seleccionados.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
