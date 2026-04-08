import { db } from '@/lib/db'
import Link from 'next/link'
import { formatPrice } from '@/lib/utils'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard Admin' }
export const revalidate = 30

export default async function AdminDashboardPage() {
  const [
    pendingVendors,
    pendingProducts,
    openIncidents,
    activeOrders,
  ] = await Promise.all([
    db.vendor.count({ where: { status: 'APPLYING' } }),
    db.product.count({ where: { status: 'PENDING_REVIEW' } }),
    db.incident.count({ where: { status: { in: ['OPEN', 'AWAITING_ADMIN'] } } }),
    db.order.count({ where: { status: { in: ['PLACED', 'PAYMENT_CONFIRMED', 'PROCESSING'] } } }),
  ])

  const hasAlerts = pendingVendors > 0 || pendingProducts > 0 || openIncidents > 0

  const recentOrders = await db.order.findMany({
    where: {},
    orderBy: { placedAt: 'desc' },
    take: 5,
    include: {
      customer: { select: { firstName: true, lastName: true } },
    },
  })

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Alerts */}
      {hasAlerts && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="font-semibold text-red-800 mb-2">Requieren atención inmediata</p>
          <div className="flex flex-wrap gap-3">
            {pendingVendors > 0 && (
              <Link href="/admin/productores?tab=solicitudes"
                className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-red-700 border border-red-200 hover:bg-red-50">
                {pendingVendors} productor{pendingVendors > 1 ? 'es' : ''} pendiente{pendingVendors > 1 ? 's' : ''}
              </Link>
            )}
            {pendingProducts > 0 && (
              <Link href="/admin/productos"
                className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-amber-700 border border-amber-200 hover:bg-amber-50">
                {pendingProducts} producto{pendingProducts > 1 ? 's' : ''} por revisar
              </Link>
            )}
            {openIncidents > 0 && (
              <Link href="/admin/incidencias"
                className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-red-700 border border-red-200 hover:bg-red-50">
                {openIncidents} incidencia{openIncidents > 1 ? 's' : ''} abierta{openIncidents > 1 ? 's' : ''}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Pedidos activos', value: activeOrders, href: '/admin/pedidos', color: 'text-blue-600' },
          { label: 'Productores pendientes', value: pendingVendors, href: '/admin/productores', color: pendingVendors > 0 ? 'text-amber-600' : 'text-gray-900' },
          { label: 'Productos por revisar', value: pendingProducts, href: '/admin/productos', color: pendingProducts > 0 ? 'text-amber-600' : 'text-gray-900' },
          { label: 'Incidencias abiertas', value: openIncidents, href: '/admin/incidencias', color: openIncidents > 0 ? 'text-red-600' : 'text-gray-900' },
        ].map(s => (
          <Link key={s.label} href={s.href}
            className="rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 transition">
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{s.label}</p>
          </Link>
        ))}
      </div>

      {/* Recent orders */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3.5 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Pedidos recientes</h2>
          <Link href="/admin/pedidos" className="text-sm text-emerald-600 hover:underline">Ver todos</Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Sin pedidos</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentOrders.map(order => (
              <div key={order.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{order.orderNumber}</p>
                  <p className="text-xs text-gray-500">{order.customer.firstName} {order.customer.lastName}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{formatPrice(Number(order.grandTotal))}</p>
                  <span className="text-xs text-gray-500">{order.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
