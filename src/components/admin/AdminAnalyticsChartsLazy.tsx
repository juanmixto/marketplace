'use client'

import dynamic from 'next/dynamic'

/**
 * Lazy wrapper for the Recharts-based admin analytics panel.
 *
 * The chart module pulls in the full Recharts tree (~150 KB gzipped) plus
 * its D3 dependencies. Importing it eagerly means every admin page that
 * shares the same top-level chunk pays that cost — including pages that
 * never render a chart. `ssr: false` also skips server rendering for the
 * chart markup, which Recharts can't hydrate cleanly anyway because
 * ResponsiveContainer measures the DOM on mount.
 *
 * The dynamic() helper can only live in a client component in Next.js 15+
 * (the `ssr: false` option is no longer valid in server components), so
 * this file is the required `'use client'` boundary around the import.
 */
const AdminAnalyticsCharts = dynamic(
  () => import('./AdminAnalyticsCharts').then(m => m.AdminAnalyticsCharts),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-[336px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] animate-pulse" />
        <div className="h-[336px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] animate-pulse" />
      </div>
    ),
  }
)

interface DailyPoint {
  date: string
  revenue: number
  orders: number
  newUsers: number
}

export function AdminAnalyticsChartsLazy({ series }: { series: DailyPoint[] }) {
  return <AdminAnalyticsCharts series={series} />
}
