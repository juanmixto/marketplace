import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getMyOrders } from '@/domains/orders/actions'
import Link from 'next/link'
import Image from 'next/image'
import { StarIcon } from '@heroicons/react/24/solid'
import { ChevronRightIcon } from '@heroicons/react/20/solid'
import { formatPrice, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { RepeatOrderButton } from '@/components/buyer/RepeatOrderButton'
import type { Metadata } from 'next'
import { getServerT } from '@/i18n/server'
import type { TranslationKeys } from '@/i18n/locales'

type T = Awaited<ReturnType<typeof getServerT>>
import { countPendingReviewsInOrder, firstPendingReviewProductId } from '@/domains/reviews/pending-policy'
import { getBuyerOrderStatus } from '@/domains/orders/buyer-status'

interface Props {
  searchParams: Promise<{ filter?: string }>
}

// Filter slugs are Spanish (the dominant locale); the labels are i18n'd. Kept
// inline because the page is the only consumer — if a second surface adopts
// the same set, lift to src/domains/orders/buyer-filters.ts.
type FilterKey = 'all' | 'por-valorar' | 'pago-pendiente' | 'entregados'

const FILTERS: { key: FilterKey; labelKey: TranslationKeys }[] = [
  { key: 'all',             labelKey: 'account.ordersFilterAll' },
  { key: 'por-valorar',     labelKey: 'account.ordersFilterPendingReviews' },
  { key: 'pago-pendiente',  labelKey: 'account.ordersFilterPaymentPending' },
  { key: 'entregados',      labelKey: 'account.ordersFilterDelivered' },
]

type OrderForFilter = Awaited<ReturnType<typeof getMyOrders>>[number]

function matchesFilter(order: OrderForFilter, filter: FilterKey): boolean {
  switch (filter) {
    case 'all': return true
    case 'por-valorar':
      return order.status === 'DELIVERED' && countPendingReviewsInOrder(order) > 0
    case 'pago-pendiente':
      return order.paymentStatus !== 'SUCCEEDED' && order.paymentStatus !== 'REFUNDED'
    case 'entregados':
      return order.status === 'DELIVERED'
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT()
  return { title: t('account.ordersTitle') }
}

function FilterTabs({ active, t }: { active: FilterKey; t: T }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {FILTERS.map(f => {
        const isActive = active === f.key
        const href = f.key === 'all' ? '/cuenta/pedidos' : `/cuenta/pedidos?filter=${f.key}`
        return (
          <Link
            key={f.key}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={
              isActive
                ? 'rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition dark:bg-emerald-500 dark:text-gray-950'
                : 'rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)]'
            }
          >
            {t(f.labelKey)}
          </Link>
        )
      })}
    </div>
  )
}

export default async function MisPedidosPage({ searchParams }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const { filter } = await searchParams
  // Back-compat: the previous PR landed `?filter=pending-reviews` and the
  // banner shipped on production with that link. Honour it as an alias of the
  // new `por-valorar` slug so users with the old URL bookmarked don't 404.
  const requested: FilterKey =
    filter === 'pending-reviews' ? 'por-valorar'
    : (FILTERS.some(f => f.key === filter) ? filter : 'all') as FilterKey
  const activeFilter = requested

  const allOrders = await getMyOrders()
  const t = await getServerT()

  const visibleOrders = activeFilter === 'all'
    ? allOrders
    : allOrders.filter(o => matchesFilter(o, activeFilter))

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('account.ordersTitle')}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {t('account.ordersSubtitle')}
        </p>
      </div>

      <FilterTabs active={activeFilter} t={t} />

      {visibleOrders.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center shadow-sm">
          <p className="text-4xl mb-3">{activeFilter === 'por-valorar' ? '⭐' : '📦'}</p>
          <p className="font-medium text-[var(--foreground-soft)]">
            {activeFilter === 'por-valorar' ? t('account.ordersPendingReviewsEmpty')
              : activeFilter === 'pago-pendiente' ? t('account.ordersPaymentPendingEmpty')
              : activeFilter === 'entregados' ? t('account.ordersDeliveredEmpty')
              : t('account.ordersEmpty')}
          </p>
          <Link
            href={activeFilter === 'all' ? '/productos' : '/cuenta/pedidos'}
            className="mt-4 inline-flex rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-300 dark:hover:bg-emerald-950/55"
          >
            {activeFilter === 'all' ? t('account.ordersExplore') : t('account.ordersFilterShowAll')}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleOrders.map(order => {
            const totalItems = order.lines.reduce((sum, l) => sum + l.quantity, 0)
            const productCount = order.lines.length
            const pendingReviews =
              order.status === 'DELIVERED' ? countPendingReviewsInOrder(order) : 0
            const pendingLabel =
              pendingReviews === 1
                ? t('pendingReviews.badgeCountOne')
                : t('pendingReviews.badgeCountOther').replace('{count}', String(pendingReviews))
            // Deep-link to the first unreviewed product so the buyer lands on
            // the form they need to fill, not at the top of the page. (#204)
            const firstPendingProductId =
              order.status === 'DELIVERED' ? firstPendingReviewProductId(order) : null
            const pendingHref = firstPendingProductId
              ? `/cuenta/pedidos/${order.id}#review-${firstPendingProductId}`
              : `/cuenta/pedidos/${order.id}#reseñas`
            return (
            <article
              key={order.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition hover:border-emerald-300 hover:shadow-sm dark:hover:border-emerald-700"
            >
              <Link
                href={`/cuenta/pedidos/${order.id}`}
                className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--foreground)]">{order.orderNumber}</p>
                    <p className="text-sm text-[var(--muted)]">{formatDate(order.placedAt)}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {totalItems} {totalItems === 1 ? t('account.ordersItem') : t('account.ordersItems')} · {productCount} {productCount === 1 ? t('account.ordersProduct') : t('account.ordersProducts')}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {(() => {
                      const badge = getBuyerOrderStatus(order)
                      return <Badge variant={badge.variant}>{badge.label}</Badge>
                    })()}
                    <p className="font-bold text-[var(--foreground)]">{formatPrice(Number(order.grandTotal))}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {order.lines.slice(0, 3).map(line => (
                    <div key={line.id} className="flex items-center gap-3">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)]">
                        {line.product.images?.[0]
                          ? <Image src={line.product.images[0]} alt={line.product.name} fill className="object-cover" sizes="40px" />
                          : <div className="flex h-full items-center justify-center text-sm">🌿</div>
                        }
                      </div>
                      <p className="min-w-0 flex-1 truncate text-sm text-[var(--foreground-soft)]">{line.product.name}</p>
                      <span className="shrink-0 text-xs text-[var(--muted)]">x{line.quantity}</span>
                    </div>
                  ))}
                  {order.lines.length > 3 && (
                    <p className="text-xs text-[var(--muted)]">+{order.lines.length - 3} {t('account.ordersMore')}</p>
                  )}
                </div>
              </Link>

              {pendingReviews > 0 && (
                <Link
                  href={pendingHref}
                  className="mt-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 transition hover:border-amber-300 hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:border-amber-700 dark:hover:bg-amber-950/60"
                >
                  <StarIcon className="h-5 w-5 shrink-0 text-amber-500 dark:text-amber-300" />
                  <span className="flex-1">
                    <strong className="font-semibold">{t('pendingReviews.badge')}</strong>
                    <span className="ml-1 text-amber-800/80 dark:text-amber-200/80">· {pendingLabel}</span>
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-amber-700/60 dark:text-amber-300/60" />
                </Link>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                <Link
                  href={`/cuenta/pedidos/${order.id}`}
                  className="inline-flex min-h-11 items-center rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                >
                  {t('account.ordersViewDetail')}
                </Link>
                <RepeatOrderButton
                  orderNumber={order.orderNumber}
                  lines={order.lines.map(line => ({
                    id: line.id,
                    productId: line.productId,
                    vendorId: line.vendorId,
                    variantId: line.variantId,
                    quantity: line.quantity,
                    unitPrice: Number(line.unitPrice),
                    product: {
                      name: line.product.name,
                      slug: line.product.slug,
                      images: line.product.images,
                    },
                    productSnapshot: line.productSnapshot,
                  }))}
                />
              </div>
            </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
