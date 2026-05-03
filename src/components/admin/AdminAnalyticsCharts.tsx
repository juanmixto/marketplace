'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useT, useLocale } from '@/i18n'

interface DailyPoint {
  date: string
  revenue: number
  orders: number
  newUsers: number
}

interface Props {
  series: DailyPoint[]
}

const tooltipStyle = {
  backgroundColor: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--foreground)',
  maxWidth: '100%',
  overflowWrap: 'anywhere' as const,
}

const tooltipWrapperStyle = {
  pointerEvents: 'auto' as const,
  maxWidth: 'min(280px, calc(100vw - 16px))',
}

function formatShortDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', { day: '2-digit', month: 'short' })
}

function formatEur(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k €`
  return `${Math.round(value)} €`
}

export function AdminAnalyticsCharts({ series }: Props) {
  const t = useT()
  const { locale } = useLocale()
  const chartData = series.map(point => ({
    ...point,
    label: formatShortDate(point.date, locale),
  }))

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
        <header className="mb-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">{t('admin.charts.salesPerDay')}</h2>
          <p className="text-xs text-[var(--muted)]">{t('admin.charts.salesPerDayHint')}</p>
        </header>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="adminRevenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--muted)" fontSize={11} />
              <YAxis stroke="var(--muted)" fontSize={11} tickFormatter={formatEur} />
              <Tooltip
                allowEscapeViewBox={{ x: false, y: false }}
                wrapperStyle={tooltipWrapperStyle}
                contentStyle={tooltipStyle}
                formatter={(value) => [formatEur(Number(value)), t('admin.charts.tooltip.revenue')]}
                labelFormatter={label => `${t('admin.charts.tooltip.dayPrefix')}: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#10b981"
                fill="url(#adminRevenueFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
        <header className="mb-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">{t('admin.charts.newUsersPerDay')}</h2>
          <p className="text-xs text-[var(--muted)]">{t('admin.charts.newUsersPerDayHint')}</p>
        </header>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--muted)" fontSize={11} />
              <YAxis stroke="var(--muted)" fontSize={11} allowDecimals={false} />
              <Tooltip
                allowEscapeViewBox={{ x: false, y: false }}
                wrapperStyle={tooltipWrapperStyle}
                contentStyle={tooltipStyle}
                formatter={(value) => [Number(value), t('admin.charts.tooltip.newUsers')]}
                labelFormatter={label => `${t('admin.charts.tooltip.dayPrefix')}: ${label}`}
              />
              <Bar dataKey="newUsers" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}
