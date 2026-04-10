import { getMyProducts } from '@/domains/vendors/actions'
import Link from 'next/link'
import Image from 'next/image'
import { formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { PlusIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { ProductActions } from '@/components/vendor/ProductActions'
import type { BadgeVariant } from '@/domains/catalog/types'
import type { Metadata } from 'next'
import { formatExpirationLabel, getExpirationTone, isProductExpired } from '@/domains/catalog/availability'

export const metadata: Metadata = { title: 'Mi catálogo' }

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  DRAFT:          { label: 'Borrador',      variant: 'default' },
  PENDING_REVIEW: { label: 'En revisión',   variant: 'amber' },
  ACTIVE:         { label: 'Activo',        variant: 'green' },
  REJECTED:       { label: 'Rechazado',     variant: 'red' },
  SUSPENDED:      { label: 'Suspendido',    variant: 'default' },
}

export default async function VendorProductosPage() {
  const products = await getMyProducts()
  const now = new Date()

  const lowStock = products.filter(p => p.trackStock && p.stock > 0 && p.stock <= 5)
  const outOfStock = products.filter(p => p.trackStock && p.stock === 0 && p.status === 'ACTIVE')
  const expired = products.filter(product => isProductExpired(product.expiresAt, now))

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Mi catálogo</h1>
          <p className="text-sm text-[var(--muted)]">{products.length} producto{products.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/vendor/productos/nuevo"
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        >
          <PlusIcon className="h-4 w-4" /> Nuevo producto
        </Link>
      </div>

      {/* Stock alerts */}
      {(lowStock.length > 0 || outOfStock.length > 0 || expired.length > 0) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-800 dark:bg-amber-950/30">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            {expired.length > 0 && (
              <p className="font-medium text-amber-900 dark:text-amber-300">
                {expired.length} producto{expired.length > 1 ? 's' : ''} retirado{expired.length > 1 ? 's' : ''} por caducidad: {expired.map(product => product.name).join(', ')}
              </p>
            )}
            {outOfStock.length > 0 && (
              <p className="font-medium text-amber-900 dark:text-amber-300">
                {outOfStock.length} producto{outOfStock.length > 1 ? 's' : ''} sin stock: {outOfStock.map(p => p.name).join(', ')}
              </p>
            )}
            {lowStock.length > 0 && (
              <p className="text-amber-800 dark:text-amber-400 mt-0.5">
                Stock bajo: {lowStock.map(p => `${p.name} (${p.stock})`).join(', ')}
              </p>
            )}
          </div>
        </div>
      )}

      {products.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-[var(--border)] py-16 text-center">
          <p className="text-[var(--muted)] mb-3">Aún no tienes productos</p>
          <Link href="/vendor/productos/nuevo"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
            <PlusIcon className="h-4 w-4" /> Añadir primer producto
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
          <div className="divide-y divide-[var(--border)]">
            {products.map(product => {
              const statusConfig = STATUS_CONFIG[product.status] ?? { label: product.status, variant: 'default' }
              const expirationTone = getExpirationTone(product.expiresAt, now)
              const expirationLabel = formatExpirationLabel(product.expiresAt, now)
              return (
                <div key={product.id} className="flex items-center gap-4 p-4 transition-colors hover:bg-[var(--surface-raised)]">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)]">
                    {product.images?.[0]
                      ? <Image src={product.images[0]} alt={product.name} fill className="object-cover" sizes="64px" />
                      : <div className="flex h-full items-center justify-center text-2xl">🌿</div>}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-[var(--foreground)] truncate">{product.name}</p>
                      <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                      {expirationTone === 'expired' && <Badge variant="red">Caducado</Badge>}
                      {expirationTone === 'today' && <Badge variant="amber">Caduca hoy</Badge>}
                      {expirationTone === 'soon' && <Badge variant="amber">Caduca pronto</Badge>}
                    </div>
                    <p className="text-sm text-[var(--muted)] mt-0.5">
                      {formatPrice(Number(product.basePrice))} / {product.unit}
                      {product.category && ` · ${product.category.name}`}
                    </p>
                    {expirationLabel && (
                      <p className={`mt-1 text-xs ${
                        expirationTone === 'expired'
                          ? 'text-red-600 dark:text-red-400'
                          : expirationTone === 'today' || expirationTone === 'soon'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-[var(--muted)]'
                      }`}>
                        {expirationLabel}
                      </p>
                    )}
                    {product.status === 'REJECTED' && product.rejectionNote && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        Motivo: {product.rejectionNote}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    {product.trackStock && (
                      <p className={`text-sm font-medium ${
                        product.stock === 0 ? 'text-red-600 dark:text-red-400' :
                        product.stock <= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--muted)]'
                      }`}>
                        {product.stock === 0 ? 'Sin stock' : `${product.stock} en stock`}
                      </p>
                    )}
                  </div>

                  <ProductActions product={product} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
