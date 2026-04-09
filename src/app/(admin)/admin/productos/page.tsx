import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { formatDate, formatPrice } from '@/lib/utils'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { ProductModerationActions } from '@/components/admin/ProductModerationActions'
import { getProductStatusTone } from '@/domains/admin/overview'

export const metadata: Metadata = { title: 'Productos | Admin' }
export const revalidate = 30

export default async function AdminProductsPage() {
  const [products, productStats] = await Promise.all([
    db.product.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 24,
      include: {
        vendor: { select: { displayName: true } },
        category: { select: { name: true } },
      },
    }),
    db.product.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700">Moderacion</p>
        <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
        <p className="mt-1 text-sm text-gray-500">Revision del catalogo y señales de stock.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {productStats.map(stat => (
          <div key={stat.status} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">{stat.status}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{stat._count._all}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="grid grid-cols-[1.5fr,1fr,0.8fr,0.8fr,0.8fr,0.9fr,auto] gap-4 border-b border-gray-100 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <span>Producto</span>
          <span>Productor</span>
          <span>Categoria</span>
          <span>Precio</span>
          <span>Stock</span>
          <span>Estado</span>
          <span>Acciones</span>
        </div>
        <div className="divide-y divide-gray-100">
          {products.map(product => (
            <div key={product.id} className="grid grid-cols-[1.5fr,1fr,0.8fr,0.8fr,0.8fr,0.9fr,auto] gap-4 px-5 py-4 text-sm items-center">
              <div>
                <p className="font-semibold text-gray-900">{product.name}</p>
                <p className="text-xs text-gray-500">Actualizado {formatDate(product.updatedAt)}</p>
              </div>
              <div className="font-medium text-gray-900">{product.vendor.displayName}</div>
              <div className="text-gray-600">{product.category?.name ?? 'Sin categoria'}</div>
              <div className="font-medium text-gray-900">{formatPrice(Number(product.basePrice))}</div>
              <div className={product.stock === 0 ? 'font-semibold text-red-600' : 'text-gray-900'}>
                {product.stock}
              </div>
              <div>
                <AdminStatusBadge label={product.status} tone={getProductStatusTone(product.status)} />
              </div>
              <div>
                <ProductModerationActions
                  productId={product.id}
                  productName={product.name}
                  status={product.status}
                />
              </div>
            </div>
          ))}
          {products.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-gray-500">No hay productos para mostrar.</p>
          )}
        </div>
      </div>
    </div>
  )
}
