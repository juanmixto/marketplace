import { getMyFulfillments } from '@/domains/vendors/actions'
import { Badge } from '@/components/ui/badge'
import { formatPrice, formatDate } from '@/lib/utils'
import Image from 'next/image'
import type { Metadata } from 'next'
import { FulfillmentActions } from '@/components/vendor/FulfillmentActions'
import type { BadgeVariant } from '@/domains/catalog/types'

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
        <h1 className="text-2xl font-bold text-gray-900">Mis pedidos</h1>
        <p className="text-sm text-gray-500 mt-0.5">{fulfillments.length} pedido{fulfillments.length !== 1 ? 's' : ''} en total</p>
      </div>

      {fulfillments.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 py-16 text-center">
          <p className="text-gray-500">Aún no tienes pedidos</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Activos</h2>
              <FulfillmentList fulfillments={active} />
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Historial</h2>
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
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
      {fulfillments.map(f => {
        const statusConfig = STATUS_CONFIG[f.status] ?? { label: f.status, variant: 'default' as BadgeVariant }
        const customer = f.order.customer
        return (
          <div key={f.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900">
                    Pedido #{f.orderId.slice(-6).toUpperCase()}
                  </p>
                  <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {customer.firstName} {customer.lastName} · {formatDate(f.createdAt)}
                </p>
                {f.order.address && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {f.order.address.line1}, {f.order.address.city} {f.order.address.postalCode}
                  </p>
                )}
              </div>
              <FulfillmentActions fulfillmentId={f.id} status={f.status} />
            </div>

            <div className="space-y-2">
              {f.order.lines.map(line => (
                <div key={line.id} className="flex items-center gap-3">
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {line.product.images?.[0]
                      ? <Image src={line.product.images[0]} alt={line.product.name} fill className="object-cover" sizes="40px" />
                      : <div className="flex h-full items-center justify-center text-lg">🌿</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{line.product.name}</p>
                    <p className="text-xs text-gray-500">
                      {line.quantity} {line.product.unit} · {formatPrice(Number(line.unitPrice))} / {line.product.unit}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-gray-900 shrink-0">
                    {formatPrice(Number(line.unitPrice) * line.quantity)}
                  </p>
                </div>
              ))}
            </div>

            {f.trackingNumber && (
              <p className="text-xs text-gray-500">
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
