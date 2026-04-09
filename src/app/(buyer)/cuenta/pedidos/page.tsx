import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getMyOrders } from '@/domains/orders/actions'
import Link from 'next/link'
import Image from 'next/image'
import { formatPrice, formatDate } from '@/lib/utils'
import { ORDER_STATUS_LABELS } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mis pedidos' }

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

export default async function MisPedidosPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const orders = await getMyOrders()

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Mis pedidos</h1>

      {orders.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-4xl mb-3">📦</p>
          <p className="font-medium text-gray-700">Aún no tienes pedidos</p>
          <Link href="/productos" className="mt-4 inline-block text-sm font-medium text-emerald-600 hover:underline">
            Explorar productos →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => (
            <Link
              key={order.id}
              href={`/cuenta/pedidos/${order.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-5 hover:border-emerald-300 hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-semibold text-gray-900">{order.orderNumber}</p>
                  <p className="text-sm text-gray-500">{formatDate(order.placedAt)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={STATUS_VARIANT[order.status] ?? 'default'}>
                    {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </Badge>
                  <p className="font-bold text-gray-900">{formatPrice(Number(order.grandTotal))}</p>
                </div>
              </div>

              <div className="flex gap-2">
                {order.lines.slice(0, 4).map(line => (
                  <div key={line.id} className="relative h-12 w-12 overflow-hidden rounded-lg bg-gray-100">
                    {line.product.images?.[0]
                      ? <Image src={line.product.images[0]} alt={line.product.name} fill className="object-cover" sizes="48px" />
                      : <div className="flex h-full items-center justify-center text-lg">🌿</div>
                    }
                  </div>
                ))}
                {order.lines.length > 4 && (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-500 font-medium">
                    +{order.lines.length - 4}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
