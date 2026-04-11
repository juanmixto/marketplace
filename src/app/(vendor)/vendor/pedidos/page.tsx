import { getMyFulfillments } from '@/domains/vendors/actions'
import { Badge } from '@/components/ui/badge'
import { formatPrice, formatDate } from '@/lib/utils'
import Image from 'next/image'
import type { Metadata } from 'next'
import { FulfillmentActions } from '@/components/vendor/FulfillmentActions'
import type { BadgeVariant } from '@/domains/catalog/types'
import { parseOrderAddressSnapshot } from '@/types/order'

export const metadata: Metadata = { title: 'Mis pedidos' }

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  PENDING:   { label: 'Pendiente',   variant: 'amber' },
  CONFIRMED: { label: 'Confirmado',  variant: 'default' },
  PREPARING: { label: 'Preparando', variant: 'default' },
  READY:     { label: 'Listo',       variant: 'green' },
  SHIPPED:   { label: 'Enviado',     variant: 'green' },
  DELIVERED: { label: 'Entregado',   variant: 'green' },
  CANCELLED: { label: 'Cancelado',   variant: 'red' },
}

export default async function VendorPedidosPage() {
  const fulfillments = await getMyFulfillments('all')

  const active = fulfillments.filter(f =>
    ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'].includes(f.status)
  )
  const past = fulfillments.filter(f =>
    ['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(f.status)
  )

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Mis pedidos</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">{fulfillments.length} pedido{fulfillments.length !== 1 ? 's' : ''} en total</p>
      </div>

      {fulfillments.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-[var(--border)] py-16 text-center">
          <p className="text-[var(--muted)]">Aún no tienes pedidos</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">Activos</h2>
              <FulfillmentList fulfillments={active} />
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">Historial</h2>
              <FulfillmentList fulfillments={past} />
            </section>
          )}
        </>
      )}
    </div>
  )
}

type FulfillmentWithDetails = Awaited<ReturnType<typeof getMyFulfillments>>[number]

function FulfillmentList({ fulfillments }: { fulfillments: FulfillmentWithDetails[] }) {
  return (
    <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      {fulfillments.map(f => {
        const statusConfig = STATUS_CONFIG[f.status] ?? { label: f.status, variant: 'default' as BadgeVariant }
        const customer = f.order.customer
        const shippingAddress = parseOrderAddressSnapshot(f.order.shippingAddressSnapshot) ?? f.order.address
        return (
          <div key={f.id} className="space-y-3 p-4 transition-colors hover:bg-[var(--surface-raised)]/70">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-[var(--foreground)]">
                    Pedido #{f.orderId.slice(-6).toUpperCase()}
                  </p>
                  <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                </div>
                <p className="text-sm text-[var(--muted)] mt-0.5">
                  {customer.firstName} {customer.lastName} · {formatDate(f.createdAt)}
                </p>
                {shippingAddress && (
                  <p className="text-xs text-[var(--muted-light)] mt-0.5">
                    {shippingAddress.line1}, {shippingAddress.city} {shippingAddress.postalCode}
                  </p>
                )}
              </div>
              <FulfillmentActions fulfillmentId={f.id} status={f.status} />
            </div>

            <div className="space-y-2">
              {f.order.lines.map(line => (
                <div key={line.id} className="flex items-center gap-3">
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)]">
                    {line.product.images?.[0]
                      ? <Image src={line.product.images[0]} alt={line.product.name} fill className="object-cover" sizes="40px" />
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
                Seguimiento: <span className="font-mono">{f.trackingNumber}</span>
                {f.carrier && ` (${f.carrier})`}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
