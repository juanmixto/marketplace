import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth-guard'
import { ADMIN_ROLES } from '@/lib/roles'
import { formatDate } from '@/lib/utils'
import { NotificationChannel, NotificationDeliveryStatus } from '@/generated/prisma/enums'
import { getServerT } from '@/i18n/server'

export const metadata: Metadata = { title: 'Notificaciones | Admin' }
export const revalidate = 30

const STATUS_PALETTE: Record<string, string> = {
  SENT: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-800',
  SKIPPED: 'bg-amber-100 text-amber-800',
}

type PageProps = {
  searchParams?:
    | Promise<{ status?: string; userId?: string; channel?: string }>
    | { status?: string; userId?: string; channel?: string }
}

function parseStatus(raw: string | undefined): NotificationDeliveryStatus | null {
  if (!raw) return null
  const upper = raw.toUpperCase()
  if (upper === 'SENT' || upper === 'FAILED' || upper === 'SKIPPED') return upper
  return null
}

function parseChannel(raw: string | undefined): NotificationChannel | null {
  if (!raw) return null
  const upper = raw.toUpperCase()
  if (upper === 'TELEGRAM' || upper === 'WEB_PUSH') return upper
  return null
}

export default async function AdminNotificationsPage({ searchParams }: PageProps) {
  await requireRole([...ADMIN_ROLES])
  const t = await getServerT()
  const filters = await Promise.resolve(searchParams ?? {})
  const status = parseStatus(filters.status)
  const userId = filters.userId?.trim()
  const channel = parseChannel(filters.channel)

  const deliveryWhere = {
    ...(status ? { status } : {}),
    ...(userId ? { userId } : {}),
    ...(channel ? { channel } : {}),
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

  const channelCounts = await db.notificationDelivery.groupBy({
    by: ['channel'],
    _count: { _all: true },
  })

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
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('admin.notifications.title')}</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">
          {t('admin.notifications.subtitle')}
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
        <span className="mx-2 text-[var(--muted)]">·</span>
        {channelCounts.map(row => (
          <span
            key={row.channel}
            className="rounded-full bg-[var(--surface-raised)] px-3 py-1 text-xs font-medium text-[var(--foreground)]"
          >
            {row.channel}: {row._count._all}
          </span>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-[var(--foreground)]">{t('admin.notifications.outboundTitle')}</h2>
        <div className="overflow-x-auto overscroll-x-contain touch-pan-x rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[var(--surface-muted)] text-left">
              <tr>
                <th className="px-3 py-2">{t('admin.notifications.col.date')}</th>
                <th className="px-3 py-2">{t('admin.notifications.col.user')}</th>
                <th className="px-3 py-2">{t('admin.notifications.col.channel')}</th>
                <th className="px-3 py-2">{t('admin.notifications.col.event')}</th>
                <th className="px-3 py-2">{t('admin.notifications.col.status')}</th>
                <th className="px-3 py-2">{t('admin.notifications.col.ref')}</th>
                <th className="px-3 py-2">{t('admin.notifications.col.error')}</th>
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
                    {t('admin.notifications.outboundEmpty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-[var(--foreground)]">{t('admin.notifications.actionsTitle')}</h2>
        <div className="overflow-x-auto overscroll-x-contain touch-pan-x rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-[var(--surface-muted)] text-left">
              <tr>
                <th className="px-3 py-2">{t('admin.notifications.col.date')}</th>
                <th className="px-3 py-2">{t('admin.notifications.col.user')}</th>
                <th className="px-3 py-2">{t('admin.notifications.col.chat')}</th>
                <th className="px-3 py-2">{t('admin.notifications.col.action')}</th>
                <th className="px-3 py-2">{t('admin.notifications.col.success')}</th>
                <th className="px-3 py-2">{t('admin.notifications.col.error')}</th>
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
                        {row.success ? t('admin.notifications.success.ok') : t('admin.notifications.success.fail')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-red-700">{row.error ?? ''}</td>
                  </tr>
                )
              })}
              {actions.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-[var(--muted)]" colSpan={6}>
                    {t('admin.notifications.actionsEmpty')}
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
