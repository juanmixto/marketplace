import { Metadata } from 'next'
import Link from 'next/link'
import { requireVendor } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { format, nextMonday, subDays, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'

type TrendView = 'week' | 'month'

interface PageProps {
  searchParams: Promise<{ view?: string }>
}

export const metadata: Metadata = {
  title: 'Liquidaciones | Portal Productor',
  description: 'Ver tus liquidaciones y pagos semanales',
}

const formatEUR = (amount: any | null) =>
  amount
    ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(amount))
    : '—'

const statusBadge = (status: string) => {
  const config: Record<string, { classes: string; label: string }> = {
    DRAFT: {
      classes: 'bg-gray-100 text-gray-800 dark:bg-slate-800/60 dark:text-slate-300',
      label: 'Borrador',
    },
    PENDING_APPROVAL: {
      classes: 'bg-yellow-100 text-yellow-800 dark:bg-amber-950/40 dark:text-amber-300',
      label: 'Pendiente aprobación',
    },
    APPROVED: {
      classes: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
      label: 'Aprobada',
    },
    PAID: {
      classes: 'bg-green-100 text-green-800 dark:bg-emerald-950/40 dark:text-emerald-300',
      label: 'Pagada',
    },
  }
  const info = config[status] || {
    classes: 'bg-gray-100 text-gray-800 dark:bg-slate-800/60 dark:text-slate-300',
    label: status,
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${info.classes}`}>
      {info.label}
    </span>
  )
}

export default async function Liquidaciones({ searchParams }: PageProps) {
  const { user } = await requireVendor()
  const params = await searchParams
  const view: TrendView = params.view === 'month' ? 'month' : 'week'

  const vendor = await db.vendor.findUniqueOrThrow({
    where: { userId: user.id },
  })

  const ninetyDaysAgo = subDays(new Date(), 90)

  const [settlements, thisMonthData, pendingData, topLines] = await Promise.all([
    db.settlement.findMany({
      where: { vendorId: vendor.id },
      orderBy: { periodTo: 'desc' },
      take: 50,
    }),
    db.settlement.aggregate({
      where: {
        vendorId: vendor.id,
        status: 'PAID',
        paidAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
      _sum: { netPayable: true, commissions: true },
    }),
    db.settlement.aggregate({
      where: {
        vendorId: vendor.id,
        status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] },
      },
      _sum: { netPayable: true },
    }),
    db.orderLine.findMany({
      where: {
        vendorId: vendor.id,
        createdAt: { gte: ninetyDaysAgo },
        order: { status: { in: ['DELIVERED', 'SHIPPED'] } },
      },
      select: {
        productId: true,
        quantity: true,
        unitPrice: true,
        product: { select: { name: true, slug: true, images: true, unit: true } },
      },
    }),
  ])

  const nextPaymentDay = format(nextMonday(new Date()), 'dd MMM yyyy', { locale: es })

  // Revenue trend: two views
  // - week: last 12 settlements in chronological order (one bar per settlement)
  // - month: group settlements by calendar month (periodTo), last 6 months
  let trend: Array<{ label: string; value: number }>
  if (view === 'month') {
    const byMonth = new Map<string, { label: string; value: number; sortKey: number }>()
    for (const s of settlements) {
      const monthStart = startOfMonth(s.periodTo)
      const key = monthStart.toISOString()
      const existing = byMonth.get(key)
      const amount = Number(s.netPayable)
      if (existing) {
        existing.value += amount
      } else {
        byMonth.set(key, {
          label: format(monthStart, 'MMM yy', { locale: es }),
          value: amount,
          sortKey: monthStart.getTime(),
        })
      }
    }
    trend = Array.from(byMonth.values())
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(-6)
      .map(({ label, value }) => ({ label, value }))
  } else {
    trend = settlements
      .slice(0, 12)
      .map(s => ({
        label: format(s.periodTo, 'd MMM', { locale: es }),
        value: Number(s.netPayable),
      }))
      .reverse()
  }
  const trendMax = Math.max(1, ...trend.map(t => t.value))
  const trendTotal = trend.reduce((sum, t) => sum + t.value, 0)

  // Top products: aggregate OrderLines by product
  const productMap = new Map<
    string,
    { name: string; slug: string; image: string | null; unit: string; qty: number; revenue: number }
  >()
  for (const line of topLines) {
    const key = line.productId
    const revenue = Number(line.unitPrice) * line.quantity
    const existing = productMap.get(key)
    if (existing) {
      existing.qty += line.quantity
      existing.revenue += revenue
    } else {
      productMap.set(key, {
        name: line.product.name,
        slug: line.product.slug,
        image: line.product.images[0] ?? null,
        unit: line.product.unit,
        qty: line.quantity,
        revenue,
      })
    }
  }
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
  const topProductsMax = Math.max(1, ...topProducts.map(p => p.revenue))

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-[var(--foreground)]">Liquidaciones</h1>
        <p className="mt-2 text-gray-600 dark:text-[var(--muted)]">Historial de pagos semanales</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <p className="text-sm text-gray-600 dark:text-[var(--muted)]">Cobrado este mes</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatEUR(thisMonthData._sum.netPayable)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <p className="text-sm text-gray-600 dark:text-[var(--muted)]">Pendiente de liquidar</p>
          <p className="mt-2 text-3xl font-bold text-blue-600 dark:text-blue-400">
            {formatEUR(pendingData._sum.netPayable)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <p className="text-sm text-gray-600 dark:text-[var(--muted)]">Comisiones este mes</p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-[var(--foreground)]">
            {formatEUR(thisMonthData._sum.commissions)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <p className="text-sm text-gray-600 dark:text-[var(--muted)]">Próxima liquidación</p>
          <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-[var(--foreground)]">{nextPaymentDay}</p>
        </div>
      </div>

      {/* Analytics */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Revenue trend */}
        <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-[var(--border)] dark:bg-[var(--surface)] lg:col-span-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-[var(--foreground)]">
                {view === 'month' ? 'Facturación por mes' : 'Facturación por semana'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-[var(--muted)]">
                {view === 'month'
                  ? `Últimos ${trend.length || 0} meses · Total ${formatEUR(trendTotal)}`
                  : `Últimas ${trend.length || 0} liquidaciones · Total ${formatEUR(trendTotal)}`}
              </p>
            </div>
            <div
              className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5 text-xs dark:border-[var(--border)] dark:bg-[var(--surface-raised)]"
              role="tablist"
              aria-label="Granularidad de la tendencia"
            >
              <Link
                href="/vendor/liquidaciones?view=week"
                role="tab"
                aria-selected={view === 'week'}
                className={`rounded px-3 py-1 font-medium transition-colors ${
                  view === 'week'
                    ? 'bg-white text-emerald-600 shadow-sm dark:bg-[var(--surface)] dark:text-emerald-400'
                    : 'text-gray-600 hover:text-gray-900 dark:text-[var(--muted)] dark:hover:text-[var(--foreground)]'
                }`}
              >
                Semana
              </Link>
              <Link
                href="/vendor/liquidaciones?view=month"
                role="tab"
                aria-selected={view === 'month'}
                className={`rounded px-3 py-1 font-medium transition-colors ${
                  view === 'month'
                    ? 'bg-white text-emerald-600 shadow-sm dark:bg-[var(--surface)] dark:text-emerald-400'
                    : 'text-gray-600 hover:text-gray-900 dark:text-[var(--muted)] dark:hover:text-[var(--foreground)]'
                }`}
              >
                Mes
              </Link>
            </div>
          </div>
          {trend.length === 0 ? (
            <p className="mt-6 text-sm text-gray-500 dark:text-[var(--muted)]">
              Aún no hay datos para mostrar tendencia.
            </p>
          ) : (
            <div className="mt-6">
              <div
                className="flex h-40 items-end gap-2"
                role="img"
                aria-label={
                  view === 'month'
                    ? `Facturación de los últimos ${trend.length} meses`
                    : `Facturación de las últimas ${trend.length} semanas`
                }
              >
                {trend.map((bar, idx) => {
                  const heightPct = Math.max(2, (bar.value / trendMax) * 100)
                  const isLast = idx === trend.length - 1
                  return (
                    <div
                      key={idx}
                      className={`flex-1 rounded-t transition-colors ${
                        isLast
                          ? 'bg-emerald-500 dark:bg-emerald-400'
                          : 'bg-emerald-200 hover:bg-emerald-400 dark:bg-emerald-900/60 dark:hover:bg-emerald-500'
                      }`}
                      style={{ height: `${heightPct}%` }}
                      title={`${bar.label}: ${formatEUR(bar.value)}`}
                    />
                  )
                })}
              </div>
              <div className="mt-2 flex gap-2">
                {trend.map((bar, idx) => (
                  <div
                    key={idx}
                    className="flex-1 truncate text-center text-[10px] text-gray-500 dark:text-[var(--muted)]"
                  >
                    {bar.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Top products */}
        <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-[var(--border)] dark:bg-[var(--surface)] lg:col-span-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-[var(--foreground)]">
            Productos más vendidos
          </h2>
          <p className="text-xs text-gray-500 dark:text-[var(--muted)]">Últimos 90 días</p>
          {topProducts.length === 0 ? (
            <p className="mt-6 text-sm text-gray-500 dark:text-[var(--muted)]">
              Aún no hay ventas completadas en los últimos 90 días.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {topProducts.map(p => {
                const widthPct = (p.revenue / topProductsMax) * 100
                return (
                  <li key={p.slug}>
                    <Link
                      href={`/productos/${p.slug}`}
                      className="group block rounded-md p-1.5 hover:bg-gray-50 dark:hover:bg-[var(--surface-raised)]"
                    >
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate font-medium text-gray-900 group-hover:text-emerald-600 dark:text-[var(--foreground)] dark:group-hover:text-emerald-400">
                          {p.name}
                        </span>
                        <span className="whitespace-nowrap font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatEUR(p.revenue)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-[var(--surface-raised)]">
                          <div
                            className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                        <span className="whitespace-nowrap text-[11px] text-gray-500 dark:text-[var(--muted)]">
                          {p.qty} {p.unit}
                        </span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Table */}
      {settlements.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-[var(--border)] dark:bg-[var(--surface-raised)]">
          <p className="text-gray-600 dark:text-[var(--muted)]">
            Aún no tienes liquidaciones. Los pagos se procesan semanalmente cada lunes.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-[var(--border)]">
            <thead className="bg-gray-50 dark:bg-[var(--surface-raised)]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">Período</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">
                  Ventas brutas
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">
                  Comisiones
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">
                  Reembolsos
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">
                  Neto a cobrar
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">
                  Fecha pago
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[var(--border)]">
              {settlements.map(settlement => (
                <tr key={settlement.id} className="hover:bg-gray-50 dark:hover:bg-[var(--surface-raised)]">
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-[var(--foreground)]">
                    {format(settlement.periodFrom, 'dd MMM', { locale: es })} —{' '}
                    {format(settlement.periodTo, 'dd MMM yyyy', { locale: es })}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-[var(--foreground)]">
                    {formatEUR(settlement.grossSales)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-[var(--foreground)]">
                    {formatEUR(settlement.commissions)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-[var(--foreground)]">
                    {formatEUR(settlement.refunds)}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatEUR(settlement.netPayable)}
                  </td>
                  <td className="px-6 py-4 text-sm">{statusBadge(settlement.status)}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-[var(--foreground)]">
                    {settlement.paidAt
                      ? format(settlement.paidAt, 'dd MMM yyyy', { locale: es })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
