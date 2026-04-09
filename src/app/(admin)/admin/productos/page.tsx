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
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Moderacion</p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Productos</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Revision del catalogo y señales de stock.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {productStats.map(stat => (
          <div key={stat.status} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--muted-light)]">{stat.status}</p>
            <p className="mt-2 text-3xl font-bold text-[var(--foreground)]">{stat._count._all}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="grid grid-cols-[1.5fr,1fr,0.8fr,0.8fr,0.8fr,0.9fr,auto] gap-4 border-b border-[var(--border)] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          <span>Producto</span>
          <span>Productor</span>
          <span>Categoria</span>
          <span>Precio</span>
          <span>Stock</span>
          <span>Estado</span>
          <span>Acciones</span>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {products.map(product => (
            <div key={product.id} className="grid grid-cols-[1.5fr,1fr,0.8fr,0.8fr,0.8fr,0.9fr,auto] gap-4 px-5 py-4 text-sm items-center">
              <div>
                <p className="font-semibold text-[var(--foreground)]">{product.name}</p>
                <p className="text-xs text-[var(--muted)]">Actualizado {formatDate(product.updatedAt)}</p>
              </div>
              <div className="font-medium text-[var(--foreground)]">{product.vendor.displayName}</div>
              <div className="text-[var(--foreground-soft)]">{product.category?.name ?? 'Sin categoria'}</div>
              <div className="font-medium text-[var(--foreground)]">{formatPrice(Number(product.basePrice))}</div>
              <div className={product.stock === 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-[var(--foreground)]'}>
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
            <p className="px-5 py-10 text-center text-sm text-[var(--muted)]">No hay productos para mostrar.</p>
          )}
        </div>
      </div>
    </div>
  )
}
