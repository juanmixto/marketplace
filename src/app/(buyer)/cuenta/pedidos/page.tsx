import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getMyOrders } from '@/domains/orders/actions'
import Link from 'next/link'
import Image from 'next/image'
import { StarIcon } from '@heroicons/react/24/solid'
import { formatPrice, formatDate } from '@/lib/utils'
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { RepeatOrderButton } from '@/components/buyer/RepeatOrderButton'
import type { Metadata } from 'next'
import { getServerT } from '@/i18n/server'
import { countPendingReviewsInOrder, firstPendingReviewProductId } from '@/domains/reviews/pending-policy'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT()
  return { title: t('account.ordersTitle') }
}

const STATUS_VARIANT: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'default'> = {
  PLACED: 'blue',
  PAYMENT_CONFIRMED: 'blue',
  PROCESSING: 'amber',
  PARTIALLY_SHIPPED: 'amber',
  SHIPPED: 'amber',
  DELIVERED: 'green',
  CANCELLED: 'red',
  REFUNDED: 'default',
}

const PAYMENT_STATUS_VARIANT: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'default'> = {
  PENDING: 'amber',
  SUCCEEDED: 'green',
  FAILED: 'red',
  REFUNDED: 'default',
  PARTIALLY_REFUNDED: 'default',
}

export default async function MisPedidosPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const orders = await getMyOrders()
  const t = await getServerT()

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('account.ordersTitle')}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {t('account.ordersSubtitle')}
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center shadow-sm">
          <p className="text-4xl mb-3">📦</p>
          <p className="font-medium text-[var(--foreground-soft)]">{t('account.ordersEmpty')}</p>
          <Link href="/productos" className="mt-4 inline-flex rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-300 dark:hover:bg-emerald-950/55">
            {t('account.ordersExplore')}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => {
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
                    <Badge variant={STATUS_VARIANT[order.status] ?? 'default'}>
                      {ORDER_STATUS_LABELS[order.status] ?? order.status}
                    </Badge>
                    <Badge variant={PAYMENT_STATUS_VARIANT[order.paymentStatus] ?? 'default'}>
                      {PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
                    </Badge>
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
                  <span aria-hidden>→</span>
                </Link>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                <Link
                  href={`/cuenta/pedidos/${order.id}`}
                  className="text-sm font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
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
