import type { Metadata } from 'next'
import { formatPrice } from '@/lib/utils'
import { getAdminDailyRevenue, getAdminStats } from '@/domains/admin-stats/queries'
import { AdminAnalyticsChartsLazy } from '@/components/admin/AdminAnalyticsChartsLazy'
import { getServerT, getServerLocale } from '@/i18n/server'

export const metadata: Metadata = { title: 'Analytics — Admin' }
export const revalidate = 60

export default async function AdminAnalyticsPage() {
  // Admin gate is enforced by src/app/(admin)/layout.tsx via requireAdmin().
  const [stats, dailySeries, t, locale] = await Promise.all([
    getAdminStats(),
    getAdminDailyRevenue(30),
    getServerT(),
    getServerLocale(),
  ])

  const numLocale = locale === 'en' ? 'en-US' : 'es-ES'
  const cards = [
    {
      label: t('admin.analytics.kpi.totalUsers'),
      value: stats.totalUsers.toLocaleString(numLocale),
      hint: t('admin.analytics.kpi.plus30Days').replace('{count}', stats.newUsersLast30Days.toLocaleString(numLocale)),
    },
    {
      label: t('admin.analytics.kpi.totalOrders'),
      value: stats.totalOrders.toLocaleString(numLocale),
      hint: t('admin.analytics.kpi.last30Days').replace('{count}', stats.ordersLast30Days.toLocaleString(numLocale)),
    },
    {
      label: t('admin.analytics.kpi.totalRevenue'),
      value: formatPrice(stats.totalRevenue),
      hint: t('admin.analytics.kpi.last30Days').replace('{count}', formatPrice(stats.revenueLast30Days)),
    },
    {
      label: t('admin.analytics.kpi.averageTicket'),
      value: formatPrice(stats.averageOrderValue),
      hint: t('admin.analytics.kpi.historicAverage'),
    },
  ]

  return (
    <div className="space-y-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('admin.analytics.title')}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {t('admin.analytics.subtitle')}
        </p>
      </header>

      <section
        aria-label={t('admin.analytics.kpisAriaLabel')}
        className="grid grid-cols-2 gap-4 sm:grid-cols-4"
      >
        {cards.map(card => (
          <div
            key={card.label}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
              {card.label}
            </p>
            <p className="mt-1.5 text-2xl font-bold text-[var(--foreground)]">{card.value}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{card.hint}</p>
          </div>
        ))}
      </section>

      <AdminAnalyticsChartsLazy series={dailySeries} />

      <p className="text-xs text-[var(--muted)]">
        {t('admin.analytics.refreshNotice')}{' '}
        <code className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5">{'/api/admin/stats'}</code>{' '}
        ·{' '}
        <code className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5">{'/api/admin/revenue'}</code>.
      </p>
    </div>
  )
}
