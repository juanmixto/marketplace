import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { redirect } from 'next/navigation'
import { formatDate, formatPrice } from '@/lib/utils'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { getIncidentStatusTone } from '@/domains/admin/overview'
import { IncidentDetailClient } from '@/components/admin/IncidentDetailClient'
import { getServerT } from '@/i18n/server'

interface Props {
  params: Promise<{ id: string }>
}

export const metadata: Metadata = { title: 'Detalle de Incidencia | Admin' }

export default async function AdminIncidentDetailPage({ params }: Props) {
  await requireAdmin()
  const t = await getServerT()

  const { id } = await params

  const incident = await db.incident.findUnique({
    where: { id },
    include: {
      customer: { select: { firstName: true, lastName: true, email: true } },
      order: { select: { orderNumber: true, grandTotal: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, body: true, authorId: true, authorRole: true, createdAt: true },
      },
    },
  })

  if (!incident) redirect('/admin/incidencias')

  // Resolve author display names from unique authorIds
  const authorIds = [...new Set(incident.messages.map(m => m.authorId))]
  const authors = await db.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, firstName: true, lastName: true },
  })
  const authorMap = new Map(authors.map(a => [a.id, `${a.firstName} ${a.lastName}`]))

  const messages = incident.messages.map(m => ({
    id: m.id,
    body: m.body,
    authorName: authorMap.get(m.authorId) ?? m.authorRole,
    authorRole: m.authorRole,
    createdAt: m.createdAt,
  }))

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <div>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{t('admin.incidentDetail.kicker')}</p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          {t('admin.incidentDetail.titlePrefix')} · {incident.type}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {incident.order.orderNumber} · {incident.customer.firstName} {incident.customer.lastName}
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">{t('admin.incidentDetail.kpi.status')}</p>
          <div className="mt-3">
            <AdminStatusBadge label={incident.status} tone={getIncidentStatusTone(incident.status)} />
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">{t('admin.incidentDetail.kpi.created')}</p>
          <p className="mt-3 font-semibold text-[var(--foreground)]">{formatDate(incident.createdAt)}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">{t('admin.incidentDetail.kpi.sla')}</p>
          <p className="mt-3 font-semibold text-[var(--foreground)]">{formatDate(incident.slaDeadline)}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">{t('admin.incidentDetail.kpi.messages')}</p>
          <p className="mt-3 font-semibold text-[var(--foreground)]">{messages.length}</p>
        </div>
      </div>

      {/* Description + Customer info */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm lg:col-span-2">
          <h2 className="mb-3 font-semibold text-[var(--foreground)]">{t('admin.incidentDetail.descriptionTitle')}</h2>
          <p className="leading-relaxed text-[var(--foreground-soft)]">{incident.description}</p>

          {incident.resolution && (
            <div className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-950/30">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-900 dark:text-emerald-300">
                {t('admin.incidentDetail.resolutionApplied')}
              </p>
              <p className="mt-2 text-sm font-semibold text-emerald-900 dark:text-emerald-300">
                {incident.resolution}
              </p>
              {incident.internalNote && (
                <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-400">{incident.internalNote}</p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-[var(--foreground)]">{t('admin.incidentDetail.customerTitle')}</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted-light)]">{t('admin.incidentDetail.customerName')}</dt>
              <dd className="mt-1 text-[var(--foreground)]">
                {incident.customer.firstName} {incident.customer.lastName}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted-light)]">{t('admin.incidentDetail.customerEmail')}</dt>
              <dd className="mt-1 text-[var(--foreground)]">{incident.customer.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted-light)]">{t('admin.incidentDetail.orderTotal')}</dt>
              <dd className="mt-1 font-semibold text-[var(--foreground)]">
                {formatPrice(Number(incident.order.grandTotal))}
              </dd>
            </div>
            {incident.refundAmount && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted-light)]">{t('admin.incidentDetail.refund')}</dt>
                <dd className="mt-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatPrice(Number(incident.refundAmount))}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Interactive messaging + resolve panel */}
      <IncidentDetailClient
        incidentId={incident.id}
        status={incident.status}
        messages={messages}
      />
    </div>
  )
}
