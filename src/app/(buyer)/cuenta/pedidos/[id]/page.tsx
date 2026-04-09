import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { getOrderDetail } from '@/domains/orders/actions'
import Image from 'next/image'
import Link from 'next/link'
import { formatPrice, formatDate } from '@/lib/utils'
import { ORDER_STATUS_LABELS, FULFILLMENT_STATUS_LABELS } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import type { Metadata } from 'next'

interface Props { params: Promise<{ id: string }>, searchParams: Promise<{ nuevo?: string }> }

export const metadata: Metadata = { title: 'Detalle del pedido' }

export default async function OrderDetailPage({ params, searchParams }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const { id } = await params
  const { nuevo } = await searchParams
  const order = await getOrderDetail(id)
  if (!order) notFound()

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Success banner */}
      {nuevo === '1' && (
        <div className="mb-6 rounded-xl bg-emerald-50 border border-emerald-200 p-5 flex items-start gap-3">
          <CheckCircleIcon className="h-6 w-6 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-900">¡Pedido confirmado!</p>
            <p className="text-sm text-emerald-700 mt-0.5">
              Hemos recibido tu pedido. Recibirás actualizaciones por email.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{order.orderNumber}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatDate(order.placedAt)}</p>
        </div>
        <Badge variant={order.status === 'DELIVERED' ? 'green' : order.status === 'CANCELLED' ? 'red' : 'blue'}>
          {ORDER_STATUS_LABELS[order.status] ?? order.status}
        </Badge>
      </div>

      {/* Products */}
      <div className="rounded-xl border border-gray-200 bg-white mb-4">
        <div className="border-b border-gray-100 px-5 py-3.5">
          <h2 className="font-semibold text-gray-900">Productos</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {order.lines.map(line => (
            <div key={line.id} className="flex items-center gap-4 px-5 py-4">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                {line.product.images?.[0]
                  ? <Image src={line.product.images[0]} alt={line.product.name} fill className="object-cover" sizes="56px" />
                  : <div className="flex h-full items-center justify-center text-xl">🌿</div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <Link href={`/productos/${line.product.slug}`} className="font-medium text-gray-900 hover:text-emerald-600">
                  {line.product.name}
                </Link>
                <p className="text-sm text-gray-500">× {line.quantity} {line.product.unit}</p>
              </div>
              <p className="font-medium text-gray-900 shrink-0">
                {formatPrice(Number(line.unitPrice) * line.quantity)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Fulfillments */}
      {order.fulfillments.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white mb-4">
          <div className="border-b border-gray-100 px-5 py-3.5">
            <h2 className="font-semibold text-gray-900">Estado del envío</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {order.fulfillments.map(f => (
              <div key={f.id} className="flex items-center justify-between px-5 py-3">
                <p className="text-sm font-medium text-gray-700">{f.vendor.displayName}</p>
                <div className="flex items-center gap-2">
                  {f.trackingNumber && (
                    <span className="text-xs text-gray-500 font-mono">{f.trackingNumber}</span>
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
      <div className="rounded-xl border border-gray-200 bg-white mb-4 p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Resumen</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span><span>{formatPrice(Number(order.subtotal))}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Envío</span>
            <span>{Number(order.shippingCost) === 0 ? 'Gratis' : formatPrice(Number(order.shippingCost))}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-100 pt-2">
            <span>Total</span><span>{formatPrice(Number(order.grandTotal))}</span>
          </div>
        </div>
      </div>

      {/* Address */}
      {order.address && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900 mb-2">Dirección de entrega</h2>
          <p className="text-sm text-gray-600">
            {order.address.firstName} {order.address.lastName}<br />
            {order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ''}<br />
            {order.address.postalCode} {order.address.city}, {order.address.province}
          </p>
        </div>
      )}

      <div className="mt-6">
        <Link href="/cuenta/pedidos" className="text-sm text-emerald-600 hover:underline">
          ← Volver a mis pedidos
        </Link>
      </div>
    </div>
  )
}
