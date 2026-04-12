'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { PlusIcon, ExclamationTriangleIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { ProductActions } from '@/components/vendor/ProductActions'
import { ProductQuickFix, type ProductProblem } from '@/components/vendor/ProductQuickFix'
import { useT, type TranslationKeys } from '@/i18n'
import type { BadgeVariant } from '@/domains/catalog/types'
import { formatExpirationLabel, getExpirationTone, isProductExpired } from '@/domains/catalog/availability'
import type { getMyProducts } from '@/domains/vendors/actions'

type ProductWithCategory = Awaited<ReturnType<typeof getMyProducts>>[number]
type ProductStatus = ProductWithCategory['status']
type StockFilter = 'all' | 'low' | 'out'

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  DRAFT: 'default',
  PENDING_REVIEW: 'amber',
  ACTIVE: 'green',
  REJECTED: 'red',
  SUSPENDED: 'default',
}

const STATUS_I18N_KEY = {
  DRAFT: 'vendor.status.draft',
  PENDING_REVIEW: 'vendor.status.pendingReview',
  ACTIVE: 'vendor.status.active',
  REJECTED: 'vendor.status.rejected',
  SUSPENDED: 'vendor.status.suspended',
} as const satisfies Record<string, TranslationKeys>

const STATUS_ORDER: ProductStatus[] = ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'SUSPENDED']

const PROBLEM_PRIORITY: Record<NonNullable<ProductProblem>, number> = {
  rejected: 0,
  expired: 1,
  'out-of-stock': 2,
  'low-stock': 3,
  draft: 4,
}

function getProblem(product: ProductWithCategory, now: Date): ProductProblem {
  if (product.status === 'REJECTED') return 'rejected'
  if (isProductExpired(product.expiresAt, now)) return 'expired'
  if (product.status === 'ACTIVE' && product.trackStock) {
    if (product.stock === 0) return 'out-of-stock'
    if (product.stock <= 5) return 'low-stock'
  }
  if (product.status === 'DRAFT') return 'draft'
  return null
}

interface Props {
  products: ProductWithCategory[]
}

export function VendorProductListClient({ products }: Props) {
  const t = useT()
  const now = useMemo(() => new Date(), [])

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProductStatus | 'ALL'>('ALL')
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')

  const lowStock = products.filter(p => p.trackStock && p.stock > 0 && p.stock <= 5)
  const outOfStock = products.filter(p => p.trackStock && p.stock === 0 && p.status === 'ACTIVE')
  const expired = products.filter(product => isProductExpired(product.expiresAt, now))

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of products) {
      if (p.category) map.set(p.category.name, p.category.name)
    }
    return Array.from(map.keys()).sort((a, b) => a.localeCompare(b))
  }, [products])

  const statusOptions = useMemo(() => {
    const present = new Set(products.map(p => p.status))
    return STATUS_ORDER.filter(s => present.has(s))
  }, [products])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = products
      .filter(p => {
        if (q && !p.name.toLowerCase().includes(q)) return false
        if (statusFilter !== 'ALL' && p.status !== statusFilter) return false
        if (categoryFilter !== 'ALL' && p.category?.name !== categoryFilter) return false
        if (stockFilter === 'low' && !(p.trackStock && p.stock > 0 && p.stock <= 5)) return false
        if (stockFilter === 'out' && !(p.trackStock && p.stock === 0)) return false
        return true
      })
      .map(product => ({ product, problem: getProblem(product, now) }))

    list.sort((a, b) => {
      const ap = a.problem ? PROBLEM_PRIORITY[a.problem] : 99
      const bp = b.problem ? PROBLEM_PRIORITY[b.problem] : 99
      return ap - bp
    })

    return list
  }, [products, search, statusFilter, categoryFilter, stockFilter, now])

  const hasActiveFilters =
    search.trim() !== '' || statusFilter !== 'ALL' || categoryFilter !== 'ALL' || stockFilter !== 'all'

  function clearFilters() {
    setSearch('')
    setStatusFilter('ALL')
    setCategoryFilter('ALL')
    setStockFilter('all')
  }

  const productsLabel = products.length === 1 ? t('vendor.productsOne') : t('vendor.productsOther')

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('vendor.myCatalog')}</h1>
          <p className="text-sm text-[var(--muted)]">{products.length} {productsLabel}</p>
        </div>
        <Link
          href="/vendor/productos/nuevo"
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        >
          <PlusIcon className="h-4 w-4" /> {t('vendor.newProduct')}
        </Link>
      </div>

      {/* Stock alerts — always reflect the full catalog, not the filtered view */}
      {(lowStock.length > 0 || outOfStock.length > 0 || expired.length > 0) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-800 dark:bg-amber-950/30">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            {expired.length > 0 && (
              <p className="font-medium text-amber-900 dark:text-amber-300">
                {expired.length} {expired.length === 1 ? t('vendor.productsOne') : t('vendor.productsOther')}{' '}
                {expired.length === 1 ? t('vendor.alertExpired') : t('vendor.alertExpiredPlural')}: {expired.map(product => product.name).join(', ')}
              </p>
            )}
            {outOfStock.length > 0 && (
              <p className="font-medium text-amber-900 dark:text-amber-300">
                {outOfStock.length} {outOfStock.length === 1 ? t('vendor.productsOne') : t('vendor.productsOther')} {t('vendor.alertOutOfStock')}: {outOfStock.map(p => p.name).join(', ')}
              </p>
            )}
            {lowStock.length > 0 && (
              <p className="text-amber-800 dark:text-amber-400 mt-0.5">
                {t('vendor.alertLowStock')}: {lowStock.map(p => `${p.name} (${p.stock})`).join(', ')}
              </p>
            )}
          </div>
        </div>
      )}

      {products.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm space-y-3">
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-light)]" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('vendor.filters.searchPlaceholder')}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-9 text-sm text-[var(--foreground)] shadow-sm placeholder:text-[var(--muted-light)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={t('vendor.filters.clear')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            {statusOptions.length > 0 && (
              <FilterGroup label={t('vendor.filters.status')}>
                <Pill active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')}>
                  {t('vendor.filters.allStatuses')}
                </Pill>
                {statusOptions.map(s => {
                  const key = STATUS_I18N_KEY[s as keyof typeof STATUS_I18N_KEY]
                  return (
                    <Pill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                      {key ? t(key) : s}
                    </Pill>
                  )
                })}
              </FilterGroup>
            )}

            {categoryOptions.length > 0 && (
              <FilterGroup label={t('vendor.filters.category')}>
                <Pill active={categoryFilter === 'ALL'} onClick={() => setCategoryFilter('ALL')}>
                  {t('vendor.filters.allCategories')}
                </Pill>
                {categoryOptions.map(c => (
                  <Pill key={c} active={categoryFilter === c} onClick={() => setCategoryFilter(c)}>
                    {c}
                  </Pill>
                ))}
              </FilterGroup>
            )}

            <FilterGroup label={t('vendor.filters.stock')}>
              <Pill active={stockFilter === 'all'} onClick={() => setStockFilter('all')}>
                {t('vendor.filters.stockAll')}
              </Pill>
              <Pill active={stockFilter === 'low'} onClick={() => setStockFilter('low')}>
                {t('vendor.filters.stockLow')}
              </Pill>
              <Pill active={stockFilter === 'out'} onClick={() => setStockFilter('out')}>
                {t('vendor.filters.stockOut')}
              </Pill>
            </FilterGroup>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <XMarkIcon className="h-3.5 w-3.5" /> {t('vendor.filters.clear')}
              </button>
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
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-[var(--border)] py-12 text-center">
          <p className="text-[var(--muted)]">{t('vendor.filters.noResults')}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
          <div className="divide-y divide-[var(--border)]">
            {filtered.map(product => {
              const statusVariant = STATUS_VARIANT[product.status] ?? 'default'
              const statusI18nKey = STATUS_I18N_KEY[product.status as keyof typeof STATUS_I18N_KEY]
              const statusLabel = statusI18nKey ? t(statusI18nKey) : product.status
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
                        {t('vendor.rejectionReason')}: {product.rejectionNote}
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

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm dark:bg-emerald-500 dark:text-gray-950'
          : 'rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]'
      }
    >
      {children}
    </button>
  )
}
