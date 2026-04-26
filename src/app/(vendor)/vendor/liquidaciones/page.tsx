import { Metadata } from 'next'
import Link from 'next/link'
import { requireVendor } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { format, nextMonday, subDays, startOfMonth } from 'date-fns'
import { es as esLocale, enUS as enLocale } from 'date-fns/locale'
import { getServerT, getServerLocale } from '@/i18n/server'
import type { TranslationKeys } from '@/i18n/locales'
import es from '@/i18n/locales/es'

type TrendView = 'week' | 'month'

interface PageProps {
  searchParams: Promise<{ view?: string; period?: string }>
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`

export const metadata: Metadata = {
  title: es['vendor.liquidaciones.metaTitle'],
  description: es['vendor.liquidaciones.metaDescription'],
}

const STATUS_KEYS: Record<string, TranslationKeys> = {
  DRAFT: 'vendor.liquidaciones.statusDraft',
  PENDING_APPROVAL: 'vendor.liquidaciones.statusPendingApproval',
  APPROVED: 'vendor.liquidaciones.statusApproved',
  PAID: 'vendor.liquidaciones.statusPaid',
}

function statusBadge(status: string, t: (k: TranslationKeys) => string) {
  const classes: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-800 dark:bg-slate-800/60 dark:text-slate-300',
    PENDING_APPROVAL: 'bg-yellow-100 text-yellow-800 dark:bg-amber-950/40 dark:text-amber-300',
    APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
    PAID: 'bg-green-100 text-green-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  }
  const label = STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status
  const cls = classes[status] ?? 'bg-gray-100 text-gray-800 dark:bg-slate-800/60 dark:text-slate-300'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

export default async function Liquidaciones({ searchParams }: PageProps) {
  const { user } = await requireVendor()
  const params = await searchParams
  const view: TrendView = params.view === 'month' ? 'month' : 'week'
  const selectedPeriod = params.period?.trim() || null

  const t = await getServerT()
  const locale = await getServerLocale()
  const dateLocale = locale === 'en' ? enLocale : esLocale

  const formatEUR = (amount: unknown | null) =>
    amount == null
      ? '—'
      : new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'es-ES', { style: 'currency', currency: 'EUR' }).format(Number(amount))

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

  const nextPaymentDay = format(nextMonday(new Date()), 'dd MMM yyyy', { locale: dateLocale })

  let trend: Array<{ label: string; value: number; periodKey: string }>
  if (view === 'month') {
    const byMonth = new Map<string, { label: string; value: number; sortKey: number; periodKey: string }>()
    for (const s of settlements) {
      const monthStart = startOfMonth(s.periodTo)
      const key = monthKey(monthStart)
      const existing = byMonth.get(key)
      const amount = Number(s.netPayable)
      if (existing) {
        existing.value += amount
      } else {
        byMonth.set(key, {
          label: format(monthStart, 'MMM yy', { locale: dateLocale }),
          value: amount,
          sortKey: monthStart.getTime(),
          periodKey: key,
        })
      }
    }
    trend = Array.from(byMonth.values())
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(-6)
      .map(({ label, value, periodKey }) => ({ label, value, periodKey }))
  } else {
    trend = settlements
      .slice(0, 12)
      .map(s => ({
        label: format(s.periodTo, 'd MMM', { locale: dateLocale }),
        value: Number(s.netPayable),
        periodKey: s.id,
      }))
      .reverse()
  }
  const trendMax = Math.max(1, ...trend.map(t => t.value))
  const trendTotal = trend.reduce((sum, t) => sum + t.value, 0)

  const filteredSettlements = selectedPeriod
    ? view === 'month'
      ? settlements.filter(s => monthKey(startOfMonth(s.periodTo)) === selectedPeriod)
      : settlements.filter(s => s.id === selectedPeriod)
    : settlements
  let selectedLabel: string | null = null
  if (selectedPeriod && filteredSettlements.length > 0) {
    const head = filteredSettlements[0]!
    if (view === 'month') {
      const monthStart = startOfMonth(head.periodTo)
      selectedLabel = format(monthStart, locale === 'en' ? 'LLLL yyyy' : "MMMM 'de' yyyy", { locale: dateLocale })
    } else {
      selectedLabel = `${format(head.periodFrom, 'd MMM', { locale: dateLocale })} — ${format(head.periodTo, 'd MMM yyyy', { locale: dateLocale })}`
    }
  }
  const baseQuery = view === 'month' ? '?view=month' : '?view=week'

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

  const trendTitle = view === 'month' ? t('vendor.liquidaciones.trendMonthTitle') : t('vendor.liquidaciones.trendWeekTitle')
  const trendSubtitle = (view === 'month'
    ? t('vendor.liquidaciones.trendMonthSubtitle')
    : t('vendor.liquidaciones.trendWeekSubtitle')
  )
    .replace('{n}', String(trend.length || 0))
    .replace('{total}', formatEUR(trendTotal))
  const trendAria = (view === 'month'
    ? t('vendor.liquidaciones.trendMonthAria')
    : t('vendor.liquidaciones.trendWeekAria')
  ).replace('{n}', String(trend.length))

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-[var(--foreground)]">{t('vendor.liquidaciones.title')}</h1>
        <p className="mt-2 text-gray-600 dark:text-[var(--muted)]">{t('vendor.liquidaciones.subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[var(--border)] dark:bg-[var(--surface)] sm:p-6">
          <p className="text-xs text-gray-600 dark:text-[var(--muted)] sm:text-sm">{t('vendor.liquidaciones.kpiThisMonth')}</p>
          <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400 sm:mt-2 sm:text-3xl">
            {formatEUR(thisMonthData._sum.netPayable)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[var(--border)] dark:bg-[var(--surface)] sm:p-6">
          <p className="text-xs text-gray-600 dark:text-[var(--muted)] sm:text-sm">{t('vendor.liquidaciones.kpiPending')}</p>
          <p className="mt-1 text-xl font-bold text-blue-600 dark:text-blue-400 sm:mt-2 sm:text-3xl">
            {formatEUR(pendingData._sum.netPayable)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[var(--border)] dark:bg-[var(--surface)] sm:p-6">
          <p className="text-xs text-gray-600 dark:text-[var(--muted)] sm:text-sm">{t('vendor.liquidaciones.kpiCommissions')}</p>
          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-[var(--foreground)] sm:mt-2 sm:text-3xl">
            {formatEUR(thisMonthData._sum.commissions)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[var(--border)] dark:bg-[var(--surface)] sm:p-6">
          <p className="text-xs text-gray-600 dark:text-[var(--muted)] sm:text-sm">{t('vendor.liquidaciones.kpiNextPayment')}</p>
          <p className="mt-1 text-base font-semibold text-gray-900 dark:text-[var(--foreground)] sm:mt-2 sm:text-lg">{nextPaymentDay}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4 dark:border-[var(--border)] dark:bg-[var(--surface)] sm:p-6 lg:col-span-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-[var(--foreground)]">
                {trendTitle}
              </h2>
              <p className="text-xs text-gray-500 dark:text-[var(--muted)]">
                {trendSubtitle}
              </p>
            </div>
            <div
              className="inline-flex shrink-0 rounded-md border border-gray-200 bg-gray-50 p-0.5 text-xs dark:border-[var(--border)] dark:bg-[var(--surface-raised)]"
              role="tablist"
              aria-label={t('vendor.liquidaciones.trendGranAria')}
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
                {t('vendor.liquidaciones.tabWeek')}
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
                {t('vendor.liquidaciones.tabMonth')}
              </Link>
            </div>
          </div>
          {trend.length === 0 ? (
            <p className="mt-6 text-sm text-gray-500 dark:text-[var(--muted)]">
              {t('vendor.liquidaciones.trendEmpty')}
            </p>
          ) : (
            <div className="mt-6">
              <div
                className="flex h-40 items-end gap-1 sm:gap-2"
                role="img"
                aria-label={trendAria}
              >
                {trend.map((bar, idx) => {
                  const heightPct = Math.max(2, (bar.value / trendMax) * 100)
                  const isLast = idx === trend.length - 1
                  const isSelected = selectedPeriod === bar.periodKey
                  const isActive = selectedPeriod ? isSelected : isLast
                  const href = isSelected
                    ? baseQuery
                    : `${baseQuery}&period=${encodeURIComponent(bar.periodKey)}`
                  const hint = isSelected
                    ? t('vendor.liquidaciones.filterActive')
                    : t('vendor.liquidaciones.clickToFilter')
                  return (
                    <Link
                      key={bar.periodKey}
                      href={href}
                      scroll={false}
                      className={`flex-1 rounded-t transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[var(--surface)] ${
                        isActive
                          ? 'bg-emerald-500 dark:bg-emerald-400'
                          : 'bg-emerald-200 hover:bg-emerald-400 dark:bg-emerald-900/60 dark:hover:bg-emerald-500'
                      } ${isSelected ? 'ring-2 ring-emerald-600 ring-offset-2 dark:ring-offset-[var(--surface)]' : ''}`}
                      style={{ height: `${heightPct}%` }}
                      title={`${bar.label}: ${formatEUR(bar.value)} · ${hint}`}
                      aria-label={`${bar.label}: ${formatEUR(bar.value)}`}
                      aria-pressed={isSelected}
                    />
                  )
                })}
              </div>
              <div className="mt-2 flex gap-1 sm:gap-2">
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

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4 dark:border-[var(--border)] dark:bg-[var(--surface)] sm:p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-[var(--foreground)]">
            {t('vendor.liquidaciones.topTitle')}
          </h2>
          <p className="text-xs text-gray-500 dark:text-[var(--muted)]">{t('vendor.liquidaciones.topSubtitle')}</p>
          {topProducts.length === 0 ? (
            <p className="mt-6 text-sm text-gray-500 dark:text-[var(--muted)]">
              {t('vendor.liquidaciones.topEmpty')}
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

      {selectedPeriod && filteredSettlements.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600 dark:text-[var(--muted)]">{t('vendor.liquidaciones.filteringBy')}</span>
          <Link
            href={baseQuery}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
          >
            {selectedLabel ?? selectedPeriod}
            <span aria-hidden="true">✕</span>
            <span className="sr-only">{t('vendor.liquidaciones.clearFilter')}</span>
          </Link>
        </div>
      )}

      {filteredSettlements.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-[var(--border)] dark:bg-[var(--surface-raised)]">
          <p className="text-gray-600 dark:text-[var(--muted)]">
            {selectedPeriod
              ? t('vendor.liquidaciones.emptyFiltered')
              : t('vendor.liquidaciones.emptyAll')}
          </p>
          {selectedPeriod && (
            <Link
              href={baseQuery}
              className="mt-3 inline-block text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
            >
              {t('vendor.liquidaciones.viewAll')}
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto overscroll-x-contain touch-pan-x rounded-lg border border-gray-200 bg-white shadow dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-[var(--border)]">
            <thead className="bg-gray-50 dark:bg-[var(--surface-raised)]">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 text-left sm:px-6 text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">{t('vendor.liquidaciones.colPeriod')}</th>
                <th className="whitespace-nowrap px-3 py-3 text-left sm:px-6 text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">
                  {t('vendor.liquidaciones.colGross')}
                </th>
                <th className="whitespace-nowrap px-3 py-3 text-left sm:px-6 text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">
                  {t('vendor.liquidaciones.colCommissions')}
                </th>
                <th className="whitespace-nowrap px-3 py-3 text-left sm:px-6 text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">
                  {t('vendor.liquidaciones.colRefunds')}
                </th>
                <th className="whitespace-nowrap px-3 py-3 text-left sm:px-6 text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">
                  {t('vendor.liquidaciones.colNet')}
                </th>
                <th className="whitespace-nowrap px-3 py-3 text-left sm:px-6 text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">{t('vendor.liquidaciones.colStatus')}</th>
                <th className="whitespace-nowrap px-3 py-3 text-left sm:px-6 text-xs font-semibold text-gray-900 dark:text-[var(--foreground)]">
                  {t('vendor.liquidaciones.colPayDate')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[var(--border)]">
              {filteredSettlements.map(settlement => (
                <tr key={settlement.id} className="hover:bg-gray-50 dark:hover:bg-[var(--surface-raised)]">
                  <td className="whitespace-nowrap px-3 py-4 text-sm sm:px-6 text-gray-900 dark:text-[var(--foreground)]">
                    {format(settlement.periodFrom, 'dd MMM', { locale: dateLocale })} —{' '}
                    {format(settlement.periodTo, 'dd MMM yyyy', { locale: dateLocale })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm sm:px-6 font-medium text-gray-900 dark:text-[var(--foreground)]">
                    {formatEUR(settlement.grossSales)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm sm:px-6 text-gray-900 dark:text-[var(--foreground)]">
                    {formatEUR(settlement.commissions)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm sm:px-6 text-gray-900 dark:text-[var(--foreground)]">
                    {formatEUR(settlement.refunds)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm sm:px-6 font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatEUR(settlement.netPayable)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm sm:px-6">{statusBadge(settlement.status, t)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm sm:px-6 text-gray-900 dark:text-[var(--foreground)]">
                    {settlement.paidAt
                      ? format(settlement.paidAt, 'dd MMM yyyy', { locale: dateLocale })
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
