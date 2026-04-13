'use client'

import Image from 'next/image'
import Link from 'next/link'
import { formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { PlusIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { ProductActions } from '@/components/vendor/ProductActions'
import { useT } from '@/i18n'
import type { BadgeVariant } from '@/domains/catalog/types'
import { formatExpirationLabel, getExpirationTone, isProductExpired } from '@/domains/catalog/availability'
import type { getMyProducts } from '@/domains/vendors/actions'

type ProductWithCategory = Awaited<ReturnType<typeof getMyProducts>>[number]

import type { TranslationKeys } from '@/i18n/locales'

const STATUS_CONFIG: Record<string, { labelKey: TranslationKeys; variant: BadgeVariant }> = {
  DRAFT:          { labelKey: 'vendor.productsList.statusDraft',         variant: 'default' },
  PENDING_REVIEW: { labelKey: 'vendor.productsList.statusPendingReview', variant: 'amber' },
  ACTIVE:         { labelKey: 'vendor.productsList.statusActive',        variant: 'green' },
  REJECTED:       { labelKey: 'vendor.productsList.statusRejected',      variant: 'red' },
  SUSPENDED:      { labelKey: 'vendor.productsList.statusSuspended',     variant: 'default' },
}

interface Props {
  products: ProductWithCategory[]
}

export function VendorProductListClient({ products }: Props) {
  const t = useT()
  const now = new Date()

  const lowStock = products.filter(p => p.trackStock && p.stock > 0 && p.stock <= 5)
  const outOfStock = products.filter(p => p.trackStock && p.stock === 0 && p.status === 'ACTIVE')
  const expired = products.filter(product => isProductExpired(product.expiresAt, now))

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('vendor.myCatalog')}</h1>
          <p className="text-sm text-[var(--muted)]">
            {products.length === 1
              ? t('vendor.productsList.productsOne')
              : t('vendor.productsList.productsOther').replace('{count}', String(products.length))}
          </p>
        </div>
        <Link
          href="/vendor/productos/nuevo"
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        >
          <PlusIcon className="h-4 w-4" /> {t('vendor.newProduct')}
        </Link>
      </div>

      {/* Stock alerts */}
      {(lowStock.length > 0 || outOfStock.length > 0 || expired.length > 0) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-800 dark:bg-amber-950/30">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            {expired.length > 0 && (
              <p className="font-medium text-amber-900 dark:text-amber-300">
                {(expired.length === 1
                  ? t('vendor.productsList.expiredOne')
                  : t('vendor.productsList.expiredOther').replace('{count}', String(expired.length))
                ).replace('{names}', expired.map(product => product.name).join(', '))}
              </p>
            )}
            {outOfStock.length > 0 && (
              <p className="font-medium text-amber-900 dark:text-amber-300">
                {(outOfStock.length === 1
                  ? t('vendor.productsList.outOfStockOne')
                  : t('vendor.productsList.outOfStockOther').replace('{count}', String(outOfStock.length))
                ).replace('{names}', outOfStock.map(p => p.name).join(', '))}
              </p>
            )}
            {lowStock.length > 0 && (
              <p className="text-amber-800 dark:text-amber-400 mt-0.5">
                {t('vendor.productsList.lowStock').replace('{items}', lowStock.map(p => `${p.name} (${p.stock})`).join(', '))}
              </p>
            )}
          </div>
        </div>
      )}

      {products.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-[var(--border)] py-16 text-center">
          <p className="text-[var(--muted)] mb-3">{t('vendor.noProducts')}</p>
          <Link href="/vendor/productos/nuevo"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
            <PlusIcon className="h-4 w-4" /> {t('vendor.addFirstProduct')}
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
          <div className="divide-y divide-[var(--border)]">
            {products.map(product => {
              const statusEntry = STATUS_CONFIG[product.status]
              const statusLabel = statusEntry ? t(statusEntry.labelKey) : product.status
              const statusVariant: BadgeVariant = statusEntry?.variant ?? 'default'
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
                      <Badge variant={statusVariant}>{statusLabel}</Badge>
                      {expirationTone === 'expired' && <Badge variant="red">{t('vendor.expired')}</Badge>}
                      {expirationTone === 'today' && <Badge variant="amber">{t('vendor.expiresToday')}</Badge>}
                      {expirationTone === 'soon' && <Badge variant="amber">{t('vendor.expiresSoon')}</Badge>}
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
                        {t('vendor.productsList.rejectionReason').replace('{reason}', product.rejectionNote)}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    {product.trackStock && (
                      <p className={`text-sm font-medium ${
                        product.stock === 0 ? 'text-red-600 dark:text-red-400' :
                        product.stock <= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--muted)]'
                      }`}>
                        {product.stock === 0 ? t('vendor.noStock') : `${product.stock} ${t('vendor.inStock')}`}
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

