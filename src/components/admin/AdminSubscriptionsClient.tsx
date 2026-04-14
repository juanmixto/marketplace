'use client'

import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import { useT } from '@/i18n'
import type {
  SubscriptionsOverview,
  SubscriptionPlanRow,
  ActiveSubscriptionRow,
} from '@/domains/admin/subscriptions'
import type { BadgeVariant } from '@/domains/catalog/types'
import type { TranslationKeys } from '@/i18n/locales'

interface Props {
  data: SubscriptionsOverview
}

export function AdminSubscriptionsClient({ data }: Props) {
  const t = useT()

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <ArrowPathIcon className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            {t('adminSubscriptions.title')}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {t('adminSubscriptions.subtitle')}
          </p>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard
          label={t('adminSubscriptions.kpi.activePlans')}
          value={String(data.kpis.activePlans)}
          accent="emerald"
        />
        <StatCard
          label={t('adminSubscriptions.kpi.archivedPlans')}
          value={String(data.kpis.archivedPlans)}
        />
        <StatCard
          label={t('adminSubscriptions.kpi.activeSubscriptions')}
          value={String(data.kpis.activeSubscriptions)}
          accent="blue"
        />
        <StatCard
          label={t('adminSubscriptions.kpi.pastDue')}
          value={String(data.kpis.pastDueSubscriptions)}
          accent={data.kpis.pastDueSubscriptions > 0 ? 'red' : undefined}
        />
        <StatCard
          label={t('adminSubscriptions.kpi.mrr')}
          value={formatPrice(data.kpis.mrrEstimateEur)}
          accent="emerald"
        />
        <StatCard
          label={t('adminSubscriptions.kpi.churnRate')}
          value={`${data.kpis.churnRatePct.toFixed(1)}%`}
          accent={data.kpis.churnRatePct > 10 ? 'amber' : undefined}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            {t('adminSubscriptions.plansTitle')}
          </h2>
          <p className="text-xs text-[var(--muted)]">
            {t('adminSubscriptions.plansHint')}
          </p>
        </header>
        {data.plans.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">
            {t('adminSubscriptions.plansEmpty')}
          </p>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain touch-pan-x">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-raised)] text-xs uppercase tracking-wider text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-2 text-left">{t('adminSubscriptions.col.product')}</th>
                  <th className="px-4 py-2 text-left">{t('adminSubscriptions.col.vendor')}</th>
                  <th className="px-4 py-2 text-left">{t('adminSubscriptions.col.cadence')}</th>
                  <th className="px-4 py-2 text-right">{t('adminSubscriptions.col.price')}</th>
                  <th className="px-4 py-2 text-right">{t('adminSubscriptions.col.subscribers')}</th>
                  <th className="px-4 py-2 text-left">{t('adminSubscriptions.col.state')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.plans.map(plan => (
                  <PlanRow key={plan.id} plan={plan} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            {t('adminSubscriptions.subsTitle')}
          </h2>
          <p className="text-xs text-[var(--muted)]">
            {t('adminSubscriptions.subsHint')}
          </p>
        </header>
        {data.subscriptions.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">
            {t('adminSubscriptions.subsEmpty')}
          </p>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain touch-pan-x">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-raised)] text-xs uppercase tracking-wider text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-2 text-left">{t('adminSubscriptions.col.buyer')}</th>
                  <th className="px-4 py-2 text-left">{t('adminSubscriptions.col.product')}</th>
                  <th className="px-4 py-2 text-left">{t('adminSubscriptions.col.vendor')}</th>
                  <th className="px-4 py-2 text-left">{t('adminSubscriptions.col.status')}</th>
                  <th className="px-4 py-2 text-left">{t('adminSubscriptions.col.nextDelivery')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.subscriptions.map(sub => (
                  <SubRow key={sub.id} sub={sub} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'emerald' | 'amber' | 'red' | 'blue'
}) {
  const accentRing: Record<NonNullable<typeof accent>, string> = {
    emerald: 'ring-emerald-200/60 dark:ring-emerald-800/40',
    amber:   'ring-amber-200/60 dark:ring-amber-800/40',
    red:     'ring-red-200/60 dark:ring-red-800/40',
    blue:    'ring-blue-200/60 dark:ring-blue-800/40',
  }
  return (
    <div
      className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm ring-1 ${
        accent ? accentRing[accent] : 'ring-transparent'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-light)]">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[var(--foreground)] sm:text-3xl">{value}</p>
    </div>
  )
}

function PlanRow({ plan }: { plan: SubscriptionPlanRow }) {
  const t = useT()
  const cadenceKey: TranslationKeys =
    plan.cadence === 'WEEKLY'   ? 'adminSubscriptions.cadence.weekly'   :
    plan.cadence === 'BIWEEKLY' ? 'adminSubscriptions.cadence.biweekly' :
    'adminSubscriptions.cadence.monthly'

  return (
    <tr>
      <td className="px-4 py-3 font-medium text-[var(--foreground)]">{plan.product.name}</td>
      <td className="px-4 py-3 text-[var(--foreground-soft)]">{plan.vendor.displayName}</td>
      <td className="px-4 py-3">
        <Badge variant="blue">{t(cadenceKey)}</Badge>
      </td>
      <td className="px-4 py-3 text-right font-mono text-[var(--foreground)]">
        {formatPrice(plan.priceSnapshot)}
      </td>
      <td className="px-4 py-3 text-right text-[var(--foreground)]">
        {plan.activeSubscriberCount}
      </td>
      <td className="px-4 py-3">
        {plan.archivedAt ? (
          <Badge variant="default">{t('adminSubscriptions.plan.archived')}</Badge>
        ) : (
          <Badge variant="green">{t('adminSubscriptions.plan.active')}</Badge>
        )}
      </td>
    </tr>
  )
}

function SubRow({ sub }: { sub: ActiveSubscriptionRow }) {
  const t = useT()
  const statusVariant: BadgeVariant =
    sub.status === 'ACTIVE'   ? 'green' :
    sub.status === 'PAUSED'   ? 'amber' :
    sub.status === 'PAST_DUE' ? 'red'   :
    'default'
  const statusKey: TranslationKeys =
    sub.status === 'ACTIVE'   ? 'adminSubscriptions.status.active'   :
    sub.status === 'PAUSED'   ? 'adminSubscriptions.status.paused'   :
    sub.status === 'PAST_DUE' ? 'adminSubscriptions.status.pastDue'  :
    'adminSubscriptions.status.canceled'

  return (
    <tr>
      <td className="px-4 py-3 text-[var(--foreground-soft)]">{sub.buyerEmail ?? '—'}</td>
      <td className="px-4 py-3 text-[var(--foreground)]">{sub.plan.productName}</td>
      <td className="px-4 py-3 text-[var(--foreground-soft)]">{sub.plan.vendorName}</td>
      <td className="px-4 py-3">
        <Badge variant={statusVariant}>{t(statusKey)}</Badge>
      </td>
      <td className="px-4 py-3 text-xs text-[var(--muted)]">
        {formatDate(sub.nextDeliveryAt)}
      </td>
    </tr>
  )
}

function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(value))
}
