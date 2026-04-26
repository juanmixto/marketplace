import { db } from '@/lib/db'
import { formatPrice } from '@/lib/utils'
import { getServerT } from '@/i18n/server'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard Admin' }
export const revalidate = 30

export default async function AdminDashboardPage() {
  const t = await getServerT()
  const [
    pendingVendors,
    pendingProducts,
    openIncidents,
    activeOrders,
  ] = await Promise.all([
    db.vendor.count({ where: { status: 'APPLYING' } }),
    db.product.count({ where: { status: 'PENDING_REVIEW' } }),
    db.incident.count({ where: { status: { in: ['OPEN', 'AWAITING_ADMIN'] } } }),
    db.order.count({ where: { status: { in: ['PLACED', 'PAYMENT_CONFIRMED', 'PROCESSING'] } } }),
  ])

  const hasAlerts = pendingVendors > 0 || pendingProducts > 0 || openIncidents > 0

  const recentOrders = await db.order.findMany({
    where: {},
    orderBy: { placedAt: 'desc' },
    take: 5,
    include: {
      customer: { select: { firstName: true, lastName: true } },
    },
  })

  const stats = [
    { label: t('admin.dashboard.stat.activeOrders'), value: activeOrders, color: 'text-blue-600', href: '/admin/pedidos' },
    { label: t('admin.dashboard.stat.pendingVendors'), value: pendingVendors, color: pendingVendors > 0 ? 'text-amber-600' : 'text-[var(--foreground)]', href: '/admin/productores' },
    { label: t('admin.dashboard.stat.pendingProducts'), value: pendingProducts, color: pendingProducts > 0 ? 'text-amber-600' : 'text-[var(--foreground)]', href: '/admin/productos?status=PENDING_REVIEW' },
    { label: t('admin.dashboard.stat.openIncidents'), value: openIncidents, color: openIncidents > 0 ? 'text-red-600' : 'text-[var(--foreground)]', href: '/admin/incidencias' },
  ]

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('admin.dashboard.title')}</h1>

      {/* Alerts */}
      {hasAlerts && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
          <p className="font-semibold text-red-800 dark:text-red-300 mb-2">{t('admin.dashboard.alertsTitle')}</p>
          <div className="flex flex-wrap gap-3">
            {pendingVendors > 0 && (
              <Link href="/admin/productores" className="rounded-lg border border-red-200 dark:border-red-800 bg-[var(--surface)] px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950/20">
                {t(pendingVendors === 1 ? 'admin.dashboard.alert.pendingVendor' : 'admin.dashboard.alert.pendingVendors').replace('{count}', String(pendingVendors))}
              </Link>
            )}
            {pendingProducts > 0 && (
              <Link href="/admin/productos?status=PENDING_REVIEW" className="rounded-lg border border-amber-200 dark:border-amber-800 bg-[var(--surface)] px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-400 transition hover:bg-amber-50 dark:hover:bg-amber-950/20">
                {t(pendingProducts === 1 ? 'admin.dashboard.alert.productReview' : 'admin.dashboard.alert.productsReview').replace('{count}', String(pendingProducts))}
              </Link>
            )}
            {openIncidents > 0 && (
              <Link href="/admin/incidencias" className="rounded-lg border border-red-200 dark:border-red-800 bg-[var(--surface)] px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950/20">
                {t(openIncidents === 1 ? 'admin.dashboard.alert.openIncident' : 'admin.dashboard.alert.openIncidents').replace('{count}', String(openIncidents))}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map(s => (
          <Link key={s.label} href={s.href} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition hover:border-[var(--border-strong)] hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                <p className="mt-0.5 text-sm text-[var(--muted)]">{s.label}</p>
              </div>
              <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                {t('admin.dashboard.stat.viewBadge')}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent orders */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--border)] px-5 py-3.5 flex items-center justify-between">
          <h2 className="font-semibold text-[var(--foreground)]">{t('admin.dashboard.recentOrders')}</h2>
          <Link href="/admin/pedidos" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">{t('admin.dashboard.seeAll')}</Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted-light)]">{t('admin.dashboard.empty')}</p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {recentOrders.map(order => (
              <div key={order.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-medium text-[var(--foreground)] text-sm">{order.orderNumber}</p>
                  <p className="text-xs text-[var(--muted)]">{order.customer.firstName} {order.customer.lastName}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-[var(--foreground)]">{formatPrice(Number(order.grandTotal))}</p>
                  <span className="text-xs text-[var(--muted)]">{order.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
