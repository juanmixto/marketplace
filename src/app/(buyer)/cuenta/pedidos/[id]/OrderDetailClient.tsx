'use client'

import Image from 'next/image'
import Link from 'next/link'
import { formatPrice, formatDate } from '@/lib/utils'
import { ORDER_STATUS_LABELS, FULFILLMENT_STATUS_LABELS } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import { parseOrderLineSnapshot } from '@/domains/orders/order-line-snapshot'
import { ReviewFormButton } from '@/components/reviews/ReviewFormButton'
import { ReportProblemLink } from '@/components/buyer/ReportProblemLink'
import { useT } from '@/i18n'

const REPORTABLE_ORDER_STATUSES = new Set([
  'DELIVERED',
  'SHIPPED',
  'PARTIALLY_SHIPPED',
])

type OrderStatus = keyof typeof ORDER_STATUS_LABELS
type FulfillmentStatus = keyof typeof FULFILLMENT_STATUS_LABELS

interface OrderLine {
  id: string
  productId: string
  quantity: number
  unitPrice: number | { toString(): string }
  productSnapshot: unknown
  product: {
    name: string
    images: string[] | null
    slug: string
    unit: string
  }
}

interface Fulfillment {
  id: string
  status: FulfillmentStatus
  trackingNumber: string | null
  vendor: { displayName: string }
}

interface Address {
  firstName: string
  lastName: string
  line1: string
  line2?: string | null
  postalCode: string
  city: string
  province: string
}

interface Order {
  id: string
  orderNumber: string
  status: OrderStatus
  placedAt: Date | string
  subtotal: number | { toString(): string }
  shippingCost: number | { toString(): string }
  grandTotal: number | { toString(): string }
  lines: OrderLine[]
  fulfillments: Fulfillment[]
  address: Address | null
}

interface Props {
  order: Order
  nuevo: boolean
  reviewEligibility: Record<string, boolean>
}

export function OrderDetailClient({ order, nuevo, reviewEligibility }: Props) {
  const t = useT()

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Success banner */}
      {nuevo && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/35">
          <CheckCircleIcon className="mt-0.5 h-6 w-6 shrink-0 text-emerald-500 dark:text-emerald-400" />
          <div>
            <p className="font-semibold text-emerald-900 dark:text-emerald-300">{t('order.confirmed')}</p>
            <p className="mt-0.5 text-sm text-emerald-700 dark:text-emerald-400">
              {t('order.confirmedDesc')}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{order.orderNumber}</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">{formatDate(order.placedAt)}</p>
        </div>
        <Badge variant={order.status === 'DELIVERED' ? 'green' : order.status === 'CANCELLED' ? 'red' : 'blue'}>
          {ORDER_STATUS_LABELS[order.status] ?? order.status}
        </Badge>
      </div>

      {/* Products */}
      <div
        id="reseñas"
        className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] scroll-mt-24"
      >
        <div className="border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="font-semibold text-[var(--foreground)]">{t('order.products')}</h2>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {order.lines.map(line => {
            const snapshot = parseOrderLineSnapshot(line.productSnapshot)

            return (
              <div
                key={line.id}
                // Stable anchor target for deep-links from the order list
                // pending-review badge (#204): /cuenta/pedidos/{id}#review-{productId}
                // The id stays on the row even when the product is already
                // reviewed, so the URL fragment is meaningful regardless of state.
                id={`review-${line.productId}`}
                className="flex scroll-mt-24 items-center gap-4 px-5 py-4"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)]">
                  {line.product.images?.[0]
                    ? <Image src={line.product.images[0]} alt={line.product.name} fill className="object-cover" sizes="56px" />
                    : <div className="flex h-full items-center justify-center text-xl">🌿</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/productos/${line.product.slug}`} className="font-medium text-[var(--foreground)] hover:text-emerald-600 dark:hover:text-emerald-400">
                    {line.product.name}
                  </Link>
                  {snapshot?.variantName && (
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{snapshot.variantName}</p>
                  )}
                  <p className="text-sm text-[var(--muted)]">× {line.quantity} {line.product.unit}</p>
                  {reviewEligibility[line.productId] && (
                    <div className="mt-3">
                      <ReviewFormButton
                        orderId={order.id}
                        productId={line.productId}
                        productName={line.product.name}
                      />
                    </div>
                  )}
                </div>
                <p className="font-medium text-[var(--foreground)] shrink-0">
                  {formatPrice(Number(line.unitPrice) * line.quantity)}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Fulfillments */}
      {order.fulfillments.length > 0 && (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] px-5 py-3.5">
            <h2 className="font-semibold text-[var(--foreground)]">{t('order.shippingStatus')}</h2>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {order.fulfillments.map(f => (
              <div key={f.id} className="flex items-center justify-between px-5 py-3">
                <p className="text-sm font-medium text-[var(--foreground-soft)]">{f.vendor.displayName}</p>
                <div className="flex items-center gap-2">
                  {f.trackingNumber && (
                    <span className="text-xs text-[var(--muted)] font-mono">{f.trackingNumber}</span>
                  )}
                  <Badge variant={f.status === 'DELIVERED' ? 'green' : f.status === 'SHIPPED' ? 'blue' : 'amber'}>
                    {FULFILLMENT_STATUS_LABELS[f.status] ?? f.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="font-semibold text-[var(--foreground)] mb-3">{t('order.summary')}</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-[var(--foreground-soft)]">
            <span>{t('order.subtotal')}</span><span>{formatPrice(Number(order.subtotal))}</span>
          </div>
          <div className="flex justify-between text-[var(--foreground-soft)]">
            <span>{t('order.shippingCost')}</span>
            <span>{Number(order.shippingCost) === 0 ? t('order.free') : formatPrice(Number(order.shippingCost))}</span>
          </div>
          <div className="flex justify-between font-bold text-[var(--foreground)] text-base border-t border-[var(--border)] pt-2">
            <span>{t('order.total')}</span><span>{formatPrice(Number(order.grandTotal))}</span>
          </div>
        </div>
      </div>

      {/* Address */}
      {order.address && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-semibold text-[var(--foreground)] mb-2">{t('order.deliveryAddress')}</h2>
          <p className="text-sm text-[var(--foreground-soft)]">
            {order.address.firstName} {order.address.lastName}<br />
            {order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ''}<br />
            {order.address.postalCode} {order.address.city}, {order.address.province}
          </p>
        </div>
      )}

      {REPORTABLE_ORDER_STATUSES.has(order.status as string) && (
        <ReportProblemLink orderId={order.id} />
      )}

      <div className="mt-6">
        <Link href="/cuenta/pedidos" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
          {t('order.backToOrders')}
        </Link>
      </div>
    </div>
  )
}
