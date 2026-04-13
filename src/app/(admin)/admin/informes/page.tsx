import type { Metadata } from 'next'
import { parseFilters } from '@/domains/analytics/filters'
import { getAnalytics } from '@/domains/analytics/service'
import { AnalyticsFilters } from '@/components/admin/analytics/AnalyticsFilters'
import { KpiCard } from '@/components/admin/analytics/KpiCard'
import { SalesEvolutionChart } from '@/components/admin/analytics/charts/SalesEvolutionChart'
import { CategoryPieChart } from '@/components/admin/analytics/charts/CategoryPieChart'
import { RankedBarChart } from '@/components/admin/analytics/charts/RankedBarChart'
import { InsightsPanel } from '@/components/admin/analytics/InsightsPanel'
import { OrdersTable } from '@/components/admin/analytics/OrdersTable'
import type { Insight } from '@/domains/analytics/types'

export const metadata: Metadata = { title: 'Informes | Admin' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminReportsPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams
  const filters = parseFilters(resolvedParams)
  const data = await getAnalytics(filters)

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
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Analítica</p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Informes</h1>
        <p className="text-sm text-[var(--muted)]">{data.period.label}</p>
      </header>

      <AnalyticsFilters options={data.filterOptions} initial={initialDraft} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="GMV" metric={data.kpis.gmv} format="currency" />
        <KpiCard label="Pedidos" metric={data.kpis.orders} format="number" />
        <KpiCard label="AOV" metric={data.kpis.aov} format="currency" hint="Ticket medio" />
        <KpiCard label="Comisiones" metric={data.kpis.commission} format="currency" />
        <KpiCard label="Clientes únicos" metric={data.kpis.uniqueCustomers} format="number" />
        <KpiCard label="% Repiten compra" metric={data.kpis.repeatRatePct} format="percent" />
        <KpiCard label="% Incidencias" metric={data.kpis.incidentRatePct} format="percent" />
        <KpiCard label="Impuestos" metric={data.kpis.tax} format="currency" />
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Evolución de ventas</h2>
          <p className="text-xs text-[var(--muted)]">GMV y nº pedidos por día</p>
        </div>
        <SalesEvolutionChart data={data.salesEvolution} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <InsightsGrid insights={data.insights} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">Ventas por categoría</h2>
          {data.categoryBreakdown.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">Sin datos.</p>
          ) : (
            <CategoryPieChart data={data.categoryBreakdown} />
          )}
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm xl:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">Top productos (por ingresos)</h2>
          {data.topProducts.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">Sin datos.</p>
          ) : (
            <RankedBarChart data={data.topProducts} />
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">Top productores</h2>
        {data.topVendors.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">Sin datos.</p>
        ) : (
          <RankedBarChart data={data.topVendors} color="#6366f1" />
        )}
      </section>

      <OrdersTable rows={data.orders} />
    </div>
  )
}

function InsightsGrid({ insights }: { insights: Insight[] }) {
  return (
    <div className="xl:col-span-3">
      <h2 className="mb-2 text-sm font-semibold text-[var(--foreground)]">Insights del periodo</h2>
      <InsightsPanel insights={insights} />
    </div>
  )
}
