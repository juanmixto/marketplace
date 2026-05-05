import type { Metadata } from 'next'
import { parseFilters, toSerializable } from '@/domains/analytics/filters'
import { getAnalytics } from '@/domains/analytics/service'
import { AnalyticsFilters } from '@/components/admin/analytics/AnalyticsFilters'
import { KpiCard } from '@/components/admin/analytics/KpiCard'
import { SalesEvolutionChart } from '@/components/admin/analytics/charts/SalesEvolutionChart'
import { CategoryPieChart } from '@/components/admin/analytics/charts/CategoryPieChart'
import { RankedBarChart } from '@/components/admin/analytics/charts/RankedBarChart'
import { InsightsPanel } from '@/components/admin/analytics/InsightsPanel'
import { OrdersTable } from '@/components/admin/analytics/OrdersTable'
import type { Insight } from '@/domains/analytics/types'
import { getServerT } from '@/i18n/server'

export const metadata: Metadata = { title: 'Informes | Admin' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminReportsPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams
  const filters = parseFilters(resolvedParams)
  const [data, t] = await Promise.all([getAnalytics(filters), getServerT()])

  const initialDraft = {
    preset: filters.preset,
    from: filters.from.toISOString().slice(0, 10),
    to: filters.to.toISOString().slice(0, 10),
    vendorId: filters.vendorId ?? '',
    categoryId: filters.categoryId ?? '',
    status: filters.orderStatus ?? '',
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{t('admin.reports.kicker')}</p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('admin.reports.title')}</h1>
        <p className="text-sm text-[var(--muted)]">{data.period.label}</p>
      </header>

      <AnalyticsFilters options={data.filterOptions} initial={initialDraft} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={t('admin.reports.kpi.gmv')} metric={data.kpis.gmv} format="currency" />
        <KpiCard label={t('admin.reports.kpi.orders')} metric={data.kpis.orders} format="number" />
        <KpiCard label={t('admin.reports.kpi.aov')} metric={data.kpis.aov} format="currency" hint={t('admin.reports.kpi.aovHint')} />
        <KpiCard label={t('admin.reports.kpi.commission')} metric={data.kpis.commission} format="currency" />
        <KpiCard label={t('admin.reports.kpi.uniqueCustomers')} metric={data.kpis.uniqueCustomers} format="number" />
        <KpiCard label={t('admin.reports.kpi.repeatRate')} metric={data.kpis.repeatRatePct} format="percent" />
        <KpiCard label={t('admin.reports.kpi.incidentRate')} metric={data.kpis.incidentRatePct} format="percent" />
        <KpiCard label={t('admin.reports.kpi.tax')} metric={data.kpis.tax} format="currency" />
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">{t('admin.reports.salesEvolution')}</h2>
          <p className="text-xs text-[var(--muted)]">{t('admin.reports.salesEvolutionHint')}</p>
        </div>
        <SalesEvolutionChart data={data.salesEvolution} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <InsightsGrid insights={data.insights} title={t('admin.reports.insightsTitle')} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">{t('admin.reports.salesByCategory')}</h2>
          {data.categoryBreakdown.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">{t('admin.reports.empty')}</p>
          ) : (
            <CategoryPieChart data={data.categoryBreakdown} />
          )}
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm xl:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">{t('admin.reports.topProducts')}</h2>
          {data.topProducts.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">{t('admin.reports.empty')}</p>
          ) : (
            <RankedBarChart data={data.topProducts} />
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">{t('admin.reports.topVendors')}</h2>
        {data.topVendors.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">{t('admin.reports.empty')}</p>
        ) : (
          <RankedBarChart data={data.topVendors} color="#6366f1" />
        )}
      </section>

      <OrdersTable rows={data.orders} filters={toSerializable(filters)} />
    </div>
  )
}

function InsightsGrid({ insights, title }: { insights: Insight[]; title: string }) {
  return (
    <div className="xl:col-span-3">
      <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">{title}</h2>
      <InsightsPanel insights={insights} />
    </div>
  )
}
