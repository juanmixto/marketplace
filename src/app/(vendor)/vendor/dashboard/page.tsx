import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ExclamationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import type { Metadata } from 'next'
import { getAvailableProductWhere } from '@/domains/catalog/availability'
import { getServerT } from '@/i18n/server'
import type { TranslationKeys } from '@/i18n/locales'
import { VendorWelcomeTour } from '@/components/vendor/VendorWelcomeTour'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function VendorDashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const t = await getServerT()

  const vendor = await db.vendor.findUnique({
    where: { userId: session.user.id },
    include: {
      products: { where: getAvailableProductWhere() },
      fulfillments: {
        where: { status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] } },
        include: { order: { include: { lines: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!vendor) redirect('/login')

  const urgent = vendor.fulfillments.filter(f => f.status === 'PENDING' || f.status === 'READY')
  const setupSteps: Array<{ key: string; labelKey: TranslationKeys; done: boolean }> = [
    { key: 'profile', labelKey: 'vendor.dashboard.stepProfile', done: !!(vendor.description && vendor.location) },
    { key: 'product', labelKey: 'vendor.dashboard.stepProduct', done: vendor.products.length > 0 },
    { key: 'bank',    labelKey: 'vendor.dashboard.stepBank',    done: !!vendor.iban },
  ]
  const setupDone = setupSteps.filter(s => s.done).length
  const isNew = setupDone < 3

  const urgentLabel =
    urgent.length === 1
      ? t('vendor.dashboard.urgentOne')
      : t('vendor.dashboard.urgentOther').replace('{count}', String(urgent.length))

  const stats: Array<{ label: string; value: string | number; href: string }> = [
    { label: t('vendor.dashboard.statActiveProducts'), value: vendor.products.length, href: '/vendor/productos' },
    { label: t('vendor.dashboard.statActiveOrders'),   value: vendor.fulfillments.length, href: '/vendor/pedidos' },
    {
      label: t('vendor.dashboard.statRating'),
      value: vendor.avgRating ? `${Number(vendor.avgRating).toFixed(1)}★` : '—',
      href: '/vendor/valoraciones',
    },
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      <VendorWelcomeTour vendorId={vendor.id} vendorName={vendor.displayName} />
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          {t('vendor.dashboard.greeting').replace('{name}', vendor.displayName)}
        </h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">{t('vendor.dashboard.subtitle')}</p>
      </div>

      {isNew && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-amber-900 dark:text-amber-300">
              {t('vendor.dashboard.setupHeading').replace('{done}', String(setupDone))}
            </h2>
            <div className="h-2 w-32 rounded-full bg-amber-200 dark:bg-amber-900">
              <div
                className="h-2 rounded-full bg-amber-500 transition-all"
                style={{ width: `${(setupDone / 3) * 100}%` }}
              />
            </div>
          </div>
          <div className="space-y-2">
            {setupSteps.map(step => (
              <div key={step.key} className="flex items-center gap-2 text-sm">
                {step.done
                  ? <CheckCircleIcon className="h-5 w-5 text-emerald-500 shrink-0" />
                  : <div className="h-5 w-5 rounded-full border-2 border-amber-400 shrink-0" />}
                <span className={step.done ? 'text-[var(--muted)] line-through' : 'text-amber-900 dark:text-amber-300 font-medium'}>
                  {t(step.labelKey)}
                </span>
                {!step.done && (
                  <Link href={`/vendor/${step.key === 'product' ? 'productos/nuevo' : 'perfil'}`}
                    className="ml-auto inline-flex min-h-11 items-center rounded-md px-2 py-2 text-xs font-medium text-amber-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30 dark:text-amber-400">
                    {t('vendor.dashboard.doItNow')}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {urgent.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm dark:border-red-800 dark:bg-red-950/30">
          <div className="flex items-center gap-2 mb-3">
            <ExclamationCircleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
            <h2 className="font-semibold text-red-900 dark:text-red-300">{urgentLabel}</h2>
          </div>
          <div className="space-y-2">
            {urgent.map(f => (
              <div key={f.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    {t('vendor.dashboard.orderNumber').replace('{id}', f.orderId.slice(-6).toUpperCase())}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {f.status === 'PENDING' ? t('vendor.dashboard.statusPending') : t('vendor.dashboard.statusReady')}
                  </p>
                </div>
                <Link href="/vendor/pedidos"
                  className="inline-flex min-h-11 items-center rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] dark:bg-red-500 dark:hover:bg-red-400">
                  {t('vendor.dashboard.viewOrders')}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {stats.map(s => (
          <Link
            key={s.label}
            href={s.href}
            className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition-all hover:border-emerald-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] dark:hover:border-emerald-500/60"
          >
            <p className="text-2xl font-bold text-[var(--foreground)] group-hover:text-emerald-600 dark:group-hover:text-emerald-400">{s.value}</p>
            <p className="text-sm text-[var(--muted)]">{s.label}</p>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="font-semibold text-[var(--foreground)] mb-3">{t('vendor.dashboard.quickActions')}</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/vendor/productos/nuevo"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)] shadow-sm hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
            {t('vendor.dashboard.actionNewProduct')}
          </Link>
          <Link href="/vendor/productos"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)] shadow-sm hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
            {t('vendor.dashboard.actionManage')}
          </Link>
          <Link href="/"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)] shadow-sm hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
            {t('vendor.dashboard.actionViewStore')}
          </Link>
        </div>
      </div>
    </div>
  )
}
