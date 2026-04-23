import { buildInsights } from './insights'
import { describeRange, previousPeriod } from './filters'
import type { AnalyticsFilters, AnalyticsPayload } from './types'
import { getKpis } from './reports/kpis'
import { getSalesEvolution } from './reports/sales'
import { getTopProducts, getTopVendors } from './reports/rankings'
import { getCategoryBreakdown, getOrderStatusBreakdown } from './reports/breakdowns'
import { getRecentOrders } from './reports/orders'
import { getFilterOptions } from './reports/options'

export async function getAnalytics(filters: AnalyticsFilters): Promise<AnalyticsPayload> {
  const prev = previousPeriod(filters)
  const [
    kpis,
    salesEvolution,
    topProducts,
    topVendors,
    categoryBreakdown,
    orderStatusBreakdown,
    orders,
    filterOptions,
  ] = await Promise.all([
    getKpis(filters),
    getSalesEvolution(filters),
    getTopProducts(filters),
    getTopVendors(filters),
    getCategoryBreakdown(filters),
    getOrderStatusBreakdown(filters),
    getRecentOrders(filters),
    getFilterOptions(),
  ])

  const insights = buildInsights({
    kpis,
    topProducts,
    topVendors,
    categoryBreakdown,
    salesEvolution,
  })

  return {
    period: {
      from: filters.from.toISOString(),
      to: filters.to.toISOString(),
      label: describeRange(filters),
    },
    previousPeriod: { from: prev.from.toISOString(), to: prev.to.toISOString() },
    kpis,
    salesEvolution,
    topProducts,
    topVendors,
    categoryBreakdown,
    orderStatusBreakdown,
    orders,
    insights,
    filterOptions,
  }
}
