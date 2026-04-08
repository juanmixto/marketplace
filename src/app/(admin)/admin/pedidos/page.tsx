import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { formatDate, formatPrice } from '@/lib/utils'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { getOrderStatusTone } from '@/domains/admin/overview'

export const metadata: Metadata = { title: 'Pedidos | Admin' }
export const revalidate = 30

export default async function AdminOrdersPage() {
  const [orders, orderStats] = await Promise.all([
    db.order.findMany({
      orderBy: { placedAt: 'desc' },
      take: 20,
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
        lines: { select: { quantity: true } },
      },
    }),
    db.order.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-700">Operaciones</p>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="mt-1 text-sm text-gray-500">Seguimiento del flujo comercial del marketplace.</p>
        </div>
        <div className="text-right text-sm text-gray-500">
          <p>{orders.length} pedidos recientes</p>
          <p>{orderStats.length} estados activos</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {orderStats.map(stat => (
          <div key={stat.status} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">{stat.status}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{stat._count._all}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="grid grid-cols-[1.1fr,1.3fr,0.7fr,0.7fr,0.9fr] gap-4 border-b border-gray-100 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <span>Pedido</span>
          <span>Cliente</span>
          <span>Items</span>
          <span>Total</span>
          <span>Estado</span>
        </div>
        <div className="divide-y divide-gray-100">
          {orders.map(order => (
            <div key={order.id} className="grid grid-cols-[1.1fr,1.3fr,0.7fr,0.7fr,0.9fr] gap-4 px-5 py-4 text-sm">
              <div>
                <p className="font-semibold text-gray-900">{order.orderNumber}</p>
                <p className="text-xs text-gray-500">{formatDate(order.placedAt)}</p>
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  {order.customer.firstName} {order.customer.lastName}
                </p>
                <p className="truncate text-xs text-gray-500">{order.customer.email}</p>
              </div>
              <div className="font-medium text-gray-900">
                {order.lines.reduce((sum, line) => sum + line.quantity, 0)}
              </div>
              <div className="font-medium text-gray-900">
                {formatPrice(Number(order.grandTotal))}
              </div>
              <div>
                <AdminStatusBadge label={order.status} tone={getOrderStatusTone(order.status)} />
              </div>
            </div>
          ))}
          {orders.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-gray-500">Todavia no hay pedidos registrados.</p>
          )}
        </div>
      </div>
    </div>
  )
}
