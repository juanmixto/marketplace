import { getMyFulfillments } from '@/domains/vendors/actions'
import { Badge } from '@/components/ui/badge'
import { formatPrice, formatDate } from '@/lib/utils'
import Image from 'next/image'
import type { Metadata } from 'next'
import { FulfillmentActions } from '@/components/vendor/FulfillmentActions'
import { SellerOrdersTracker } from '@/components/vendor/SellerOrdersTracker'
import type { BadgeVariant } from '@/domains/catalog/types'
import { parseOrderAddressSnapshot } from '@/types/order'
import { getServerT } from '@/i18n/server'
import type { TranslationKeys } from '@/i18n/locales'

export const metadata: Metadata = { title: 'Mis pedidos' }

const STATUS_CONFIG: Record<string, { labelKey: TranslationKeys; variant: BadgeVariant }> = {
  PENDING:         { labelKey: 'vendor.orders.statusPending',   variant: 'amber' },
  CONFIRMED:       { labelKey: 'vendor.orders.statusConfirmed', variant: 'default' },
  PREPARING:       { labelKey: 'vendor.orders.statusPreparing', variant: 'default' },
  LABEL_REQUESTED: { labelKey: 'vendor.orders.statusPreparing', variant: 'default' },
  LABEL_FAILED:    { labelKey: 'vendor.orders.statusPending',   variant: 'red' },
  READY:           { labelKey: 'vendor.orders.statusReady',     variant: 'green' },
  SHIPPED:         { labelKey: 'vendor.orders.statusShipped',   variant: 'green' },
  DELIVERED:       { labelKey: 'vendor.orders.statusDelivered', variant: 'green' },
  INCIDENT:        { labelKey: 'vendor.orders.statusIncident',  variant: 'red' },
  CANCELLED:       { labelKey: 'vendor.orders.statusCancelled', variant: 'red' },
}

export default async function VendorPedidosPage() {
  const fulfillments = await getMyFulfillments('all')
  const t = await getServerT()

  const active = fulfillments.filter(f =>
    ['PENDING', 'CONFIRMED', 'PREPARING', 'LABEL_REQUESTED', 'LABEL_FAILED', 'READY', 'INCIDENT'].includes(f.status)
  )
  const past = fulfillments.filter(f =>
    ['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(f.status)
  )

  const trackedOrders = active.map(f => ({
    fulfillmentId: f.id,
    orderId: f.orderId,
    orderValue: f.order.lines.reduce(
      (sum, line) => sum + Number(line.unitPrice) * line.quantity,
      0,
    ),
    itemCount: f.order.lines.reduce((sum, line) => sum + line.quantity, 0),
  }))

  const totalLabel =
    fulfillments.length === 1
      ? t('vendor.orders.totalOne')
      : t('vendor.orders.totalOther').replace('{count}', String(fulfillments.length))

  return (
    <div className="space-y-6 max-w-4xl">
      <SellerOrdersTracker orders={trackedOrders} />
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('vendor.orders.title')}</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">{totalLabel}</p>
      </div>

      {fulfillments.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-[var(--border)] py-16 text-center">
          <p className="text-[var(--muted)]">{t('vendor.orders.empty')}</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">{t('vendor.orders.sectionActive')}</h2>
              <FulfillmentList fulfillments={active} t={t} />
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">{t('vendor.orders.sectionHistory')}</h2>
              <FulfillmentList fulfillments={past} t={t} />
            </section>
          )}
        </>
      )}
    </div>
  )
}

type FulfillmentWithDetails = Awaited<ReturnType<typeof getMyFulfillments>>[number]
type Translate = Awaited<ReturnType<typeof getServerT>>

function FulfillmentList({ fulfillments, t }: { fulfillments: FulfillmentWithDetails[]; t: Translate }) {
  return (
    <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      {fulfillments.map(f => {
        const statusEntry = STATUS_CONFIG[f.status]
        const statusLabel = statusEntry ? t(statusEntry.labelKey) : f.status
        const statusVariant: BadgeVariant = statusEntry?.variant ?? 'default'
        const customer = f.order.customer
        const shippingAddress = parseOrderAddressSnapshot(f.order.shippingAddressSnapshot) ?? f.order.address
        return (
          <div key={f.id} className="space-y-3 p-4 transition-colors hover:bg-[var(--surface-raised)]/70 sm:p-5">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-[var(--foreground)]">
                    {t('vendor.orders.orderNumber').replace('{id}', f.orderId.slice(-6).toUpperCase())}
                  </p>
                  <Badge variant={statusVariant}>{statusLabel}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-[var(--muted)]">
                  {customer.firstName} {customer.lastName} · {formatDate(f.createdAt)}
                </p>
                {shippingAddress && (
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-light)]">
                    {shippingAddress.line1}, {shippingAddress.city} {shippingAddress.postalCode}
                  </p>
                )}
              </div>
              <FulfillmentActions
                fulfillmentId={f.id}
                status={f.status}
                labelUrl={f.shipment?.labelUrl ?? null}
                trackingUrl={f.shipment?.trackingUrl ?? null}
              />
            </div>

            <div className="space-y-2">
              {f.order.lines.map(line => (
                <div key={line.id} className="flex items-center gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)] sm:h-10 sm:w-10">
                    {line.product.images?.[0]
                      ? <Image src={line.product.images[0]} alt={line.product.name} fill className="object-cover" sizes="(max-width: 640px) 48px, 40px" />
                      : <div className="flex h-full items-center justify-center text-lg">🌿</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--foreground)] truncate">{line.product.name}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {line.quantity} {line.product.unit} · {formatPrice(Number(line.unitPrice))} / {line.product.unit}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-[var(--foreground)] shrink-0">
                    {formatPrice(Number(line.unitPrice) * line.quantity)}
                  </p>
                </div>
              ))}
            </div>

            {f.trackingNumber && (
              <p className="text-xs text-[var(--muted)]">
                {t('vendor.orders.tracking')}: <span className="font-mono">{f.trackingNumber}</span>
                {f.carrier && ` (${f.carrier})`}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
