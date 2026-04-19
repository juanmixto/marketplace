import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatPrice } from '@/lib/utils'
import { getMyFulfillmentByOrderId } from '@/domains/vendors/actions'
import { parseOrderAddressSnapshot } from '@/types/order'
import { getServerT } from '@/i18n/server'
import { FulfillmentActions } from '@/components/vendor/FulfillmentActions'
import type { BadgeVariant } from '@/domains/catalog/types'
import type { TranslationKeys } from '@/i18n/locales'

interface Props {
  params: Promise<{ id: string }>
}

const STATUS_CONFIG: Record<string, { labelKey: TranslationKeys; variant: BadgeVariant }> = {
  PENDING: { labelKey: 'vendor.orders.statusPending', variant: 'amber' },
  CONFIRMED: { labelKey: 'vendor.orders.statusConfirmed', variant: 'default' },
  PREPARING: { labelKey: 'vendor.orders.statusPreparing', variant: 'default' },
  LABEL_REQUESTED: { labelKey: 'vendor.orders.statusPreparing', variant: 'default' },
  LABEL_FAILED: { labelKey: 'vendor.orders.statusPending', variant: 'red' },
  READY: { labelKey: 'vendor.orders.statusReady', variant: 'green' },
  SHIPPED: { labelKey: 'vendor.orders.statusShipped', variant: 'green' },
  DELIVERED: { labelKey: 'vendor.orders.statusDelivered', variant: 'green' },
  INCIDENT: { labelKey: 'vendor.orders.statusIncident', variant: 'red' },
  CANCELLED: { labelKey: 'vendor.orders.statusCancelled', variant: 'red' },
}

export const metadata: Metadata = { title: 'Pedido del productor' }

export default async function VendorOrderDetailPage({ params }: Props) {
  const { id } = await params
  const [fulfillment, t] = await Promise.all([
    getMyFulfillmentByOrderId(id),
    getServerT(),
  ])

  if (!fulfillment) notFound()

  const statusEntry = STATUS_CONFIG[fulfillment.status]
  const statusLabel = statusEntry ? t(statusEntry.labelKey) : fulfillment.status
  const statusVariant: BadgeVariant = statusEntry?.variant ?? 'default'
  const shippingAddress = parseOrderAddressSnapshot(fulfillment.order.shippingAddressSnapshot) ?? fulfillment.order.address
  const itemTotal = fulfillment.order.lines.reduce(
    (sum, line) => sum + Number(line.unitPrice) * line.quantity,
    0,
  )
  const orderNumber = fulfillment.orderId.slice(-6).toUpperCase()

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--muted)]">Pedido #{orderNumber}</p>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{fulfillment.order.customer.firstName} {fulfillment.order.customer.lastName}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{formatDate(fulfillment.createdAt)}</p>
        </div>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('vendor.orders.detail.productsTitle')}</h2>
            <p className="text-sm text-[var(--muted)]">{t('vendor.orders.detail.linesCount').replace('{count}', String(fulfillment.order.lines.length))}</p>
          </div>

          <div className="divide-y divide-[var(--border)]">
            {fulfillment.order.lines.map(line => (
              <div key={line.id} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)]">
                  {line.product.images?.[0] ? (
                    <Image
                      src={line.product.images[0]}
                      alt={line.product.name}
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xl">🌿</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/productos/${line.product.slug}`}
                    className="block truncate font-medium text-[var(--foreground)] hover:text-emerald-600 dark:hover:text-emerald-400"
                  >
                    {line.product.name}
                  </Link>
                  <p className="text-sm text-[var(--muted)]">
                    × {line.quantity} {line.product.unit} · {formatPrice(Number(line.unitPrice))} / {line.product.unit}
                  </p>
                </div>
                <p className="shrink-0 font-semibold text-[var(--foreground)]">
                  {formatPrice(Number(line.unitPrice) * line.quantity)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('vendor.orders.detail.summaryTitle')}</h2>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-[var(--foreground-soft)]">
                <span>{t('vendor.orders.detail.subtotal')}</span>
                <span>{formatPrice(itemTotal)}</span>
              </div>
              <div className="flex justify-between text-[var(--foreground-soft)]">
                <span>{t('vendor.orders.detail.shipping')}</span>
                <span>{fulfillment.order.shippingCost ? formatPrice(Number(fulfillment.order.shippingCost)) : t('vendor.orders.detail.free')}</span>
              </div>
              <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base font-bold text-[var(--foreground)]">
                <span>{t('vendor.orders.detail.total')}</span>
                <span>{formatPrice(Number(fulfillment.order.grandTotal))}</span>
              </div>
            </div>
          </section>

          {shippingAddress && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('vendor.orders.detail.addressTitle')}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-soft)]">
                {shippingAddress.firstName} {shippingAddress.lastName}<br />
                {shippingAddress.line1}
                {shippingAddress.line2 ? `, ${shippingAddress.line2}` : ''}<br />
                {shippingAddress.postalCode} {shippingAddress.city}, {shippingAddress.province}
              </p>
            </section>
          )}

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('vendor.orders.detail.shipmentTitle')}</h2>
            <div className="mt-3 space-y-2 text-sm">
              {fulfillment.shipment?.trackingNumber ? (
                <p className="text-[var(--foreground-soft)]">
                  {t('vendor.orders.detail.trackingLabel')}{' '}
                  {fulfillment.shipment.trackingUrl ? (
                    <a
                      href={fulfillment.shipment.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono underline underline-offset-2"
                    >
                      {fulfillment.shipment.trackingNumber}
                    </a>
                  ) : (
                    <span className="font-mono">{fulfillment.shipment.trackingNumber}</span>
                  )}
                </p>
              ) : (
                <p className="text-[var(--muted)]">{t('vendor.orders.detail.noTracking')}</p>
              )}
              <FulfillmentActions
                fulfillmentId={fulfillment.id}
                status={fulfillment.status}
                labelUrl={fulfillment.shipment?.labelUrl ?? null}
                trackingUrl={fulfillment.shipment?.trackingUrl ?? null}
              />
            </div>
          </section>

          <Link
            href="/vendor/pedidos"
            className="inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
          >
            {t('vendor.orders.detail.back')}
          </Link>
        </aside>
      </div>
    </div>
  )
}
