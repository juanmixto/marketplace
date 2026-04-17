import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth-guard'
import { ADMIN_ROLES } from '@/lib/roles'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Notificaciones | Admin' }
export const revalidate = 30

const STATUS_PALETTE: Record<string, string> = {
  SENT: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-800',
  SKIPPED: 'bg-amber-100 text-amber-800',
}

type PageProps = {
  searchParams?: Promise<{ status?: string; userId?: string }> | { status?: string; userId?: string }
}

export default async function AdminNotificationsPage({ searchParams }: PageProps) {
  await requireRole([...ADMIN_ROLES])
  const filters = await Promise.resolve(searchParams ?? {})
  const status = filters.status?.trim().toUpperCase()
  const userId = filters.userId?.trim()

  const deliveryWhere = {
    ...(status === 'SENT' || status === 'FAILED' || status === 'SKIPPED' ? { status } : {}),
    ...(userId ? { userId } : {}),
  }

  const actionWhere = userId ? { userId } : {}

  const [deliveries, actions, deliveryCounts] = await Promise.all([
    db.notificationDelivery.findMany({
      where: deliveryWhere,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        userId: true,
        channel: true,
        eventType: true,
        status: true,
        error: true,
        payloadRef: true,
        createdAt: true,
      },
    }),
    db.telegramActionLog.findMany({
      where: actionWhere,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        userId: true,
        chatId: true,
        action: true,
        success: true,
        error: true,
        createdAt: true,
      },
    }),
    db.notificationDelivery.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ])

  const userIds = Array.from(
    new Set([
      ...deliveries.map(d => d.userId),
      ...actions.map(a => a.userId).filter((id): id is string => !!id),
    ]),
  )
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, firstName: true, lastName: true },
      })
    : []
  const userMap = new Map(users.map(u => [u.id, u]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Notificaciones</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">
          Auditoría de envíos salientes (Telegram) y de acciones recibidas desde inline buttons.
        </p>
      </div>

      <section className="flex flex-wrap gap-2">
        {deliveryCounts.map(row => (
          <span
            key={row.status}
            className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_PALETTE[row.status] ?? ''}`}
          >
            {row.status}: {row._count._all}
          </span>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-[var(--foreground)]">Envíos salientes (últimos 100)</h2>
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--surface-muted)] text-left">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Usuario</th>
                <th className="px-3 py-2">Canal</th>
                <th className="px-3 py-2">Evento</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map(row => {
                const user = userMap.get(row.userId)
                return (
                  <tr key={row.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                    <td className="px-3 py-2">
                      {user ? `${user.firstName} ${user.lastName}` : row.userId}
                      {user && <div className="text-xs text-[var(--muted)]">{user.email}</div>}
                    </td>
                    <td className="px-3 py-2">{row.channel}</td>
                    <td className="px-3 py-2">{row.eventType}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PALETTE[row.status] ?? ''}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{row.payloadRef ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-red-700">{row.error ?? ''}</td>
                  </tr>
                )
              })}
              {deliveries.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-[var(--muted)]" colSpan={7}>
                    Sin envíos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-[var(--foreground)]">Acciones recibidas (últimas 50)</h2>
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--surface-muted)] text-left">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Usuario</th>
                <th className="px-3 py-2">Chat</th>
                <th className="px-3 py-2">Acción</th>
                <th className="px-3 py-2">Éxito</th>
                <th className="px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {actions.map(row => {
                const user = row.userId ? userMap.get(row.userId) : null
                return (
                  <tr key={row.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                    <td className="px-3 py-2">
                      {user ? `${user.firstName} ${user.lastName}` : row.userId ?? '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{row.chatId}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.action}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.success ? STATUS_PALETTE.SENT : STATUS_PALETTE.FAILED}`}
                      >
                        {row.success ? 'OK' : 'FAIL'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-red-700">{row.error ?? ''}</td>
                  </tr>
                )
              })}
              {actions.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-[var(--muted)]" colSpan={6}>
                    Sin acciones registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
