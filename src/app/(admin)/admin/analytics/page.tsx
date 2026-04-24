import type { Metadata } from 'next'
import { formatPrice } from '@/lib/utils'
import { getAdminDailyRevenue, getAdminStats } from '@/domains/admin-stats/queries'
import { AdminAnalyticsChartsLazy } from '@/components/admin/AdminAnalyticsChartsLazy'

export const metadata: Metadata = { title: 'Analytics — Admin' }
export const revalidate = 60

export default async function AdminAnalyticsPage() {
  // Admin gate is enforced by src/app/(admin)/layout.tsx via requireAdmin().
  const [stats, dailySeries] = await Promise.all([
    getAdminStats(),
    getAdminDailyRevenue(30),
  ])

  const cards = [
    {
      label: 'Usuarios totales',
      value: stats.totalUsers.toLocaleString('es-ES'),
      hint: `+${stats.newUsersLast30Days.toLocaleString('es-ES')} en 30 días`,
    },
    {
      label: 'Pedidos totales',
      value: stats.totalOrders.toLocaleString('es-ES'),
      hint: `${stats.ordersLast30Days.toLocaleString('es-ES')} en 30 días`,
    },
    {
      label: 'Ingresos totales',
      value: formatPrice(stats.totalRevenue),
      hint: `${formatPrice(stats.revenueLast30Days)} en 30 días`,
    },
    {
      label: 'Ticket medio',
      value: formatPrice(stats.averageOrderValue),
      hint: 'Promedio histórico',
    },
  ]

  return (
    <div className="space-y-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Analytics</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Métricas clave del marketplace en tiempo real. Este panel es complementario a PostHog
          (no lo sustituye) y consulta directamente la base de datos.
        </p>
      </header>

      <section
        aria-label="KPIs"
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
        Datos recalculados cada 60 segundos. APIs:{' '}
        <code className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5">/api/admin/stats</code>{' '}
        y{' '}
        <code className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5">/api/admin/revenue</code>.
      </p>
    </div>
  )
}
