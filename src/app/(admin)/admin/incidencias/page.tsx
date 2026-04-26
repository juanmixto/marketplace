import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { formatDate, formatPrice } from '@/lib/utils'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { getIncidentStatusTone } from '@/domains/admin/overview'
import { getServerT } from '@/i18n/server'

export const metadata: Metadata = { title: 'Incidencias | Admin' }
export const revalidate = 30

export default async function AdminIncidentsPage() {
  const t = await getServerT()
  const incidents = await db.incident.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      customer: { select: { firstName: true, lastName: true } },
      order: { select: { orderNumber: true } },
      messages: { select: { id: true } },
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{t('admin.incidents.kicker')}</p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('admin.incidents.title')}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t('admin.incidents.subtitle')}</p>
      </div>

      <div className="space-y-4">
        {incidents.map(incident => (
          <Link
            key={incident.id}
            href={`/admin/incidencias/${incident.id}`}
            className="block rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm transition hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-[var(--foreground)]">{incident.type}</h2>
                  <AdminStatusBadge
                    label={incident.status}
                    tone={getIncidentStatusTone(incident.status)}
                  />
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {incident.order.orderNumber} · {incident.customer.firstName} {incident.customer.lastName}
                </p>
              </div>
              <div className="text-right text-sm text-[var(--muted)]">
                <p>{t('admin.incidents.createdAt').replace('{date}', formatDate(incident.createdAt))}</p>
                <p>{t('admin.incidents.sla').replace('{date}', formatDate(incident.slaDeadline))}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--foreground-soft)]">{incident.description}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">{t('admin.incidents.messages')}</p>
                <p className="mt-1 font-medium text-[var(--foreground)]">{incident.messages.length}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">{t('admin.incidents.resolution')}</p>
                <p className="mt-1 font-medium text-[var(--foreground)]">{incident.resolution ?? t('admin.incidents.resolutionPending')}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">{t('admin.incidents.refund')}</p>
                <p className="mt-1 font-medium text-[var(--foreground)]">
                  {incident.refundAmount ? formatPrice(Number(incident.refundAmount)) : t('admin.incidents.refundNotApplicable')}
                </p>
              </div>
            </div>
          </Link>
        ))}
        {incidents.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)] shadow-sm">
            {t('admin.incidents.empty')}
          </p>
        )}
      </div>
    </div>
  )
}
