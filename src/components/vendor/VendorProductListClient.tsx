'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  PlusIcon,
  MinusIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  Squares2X2Icon,
  ListBulletIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'
import { ProductActions } from '@/components/vendor/ProductActions'
import { adjustProductStock, submitForReview } from '@/domains/vendors/actions'
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

type FilterKey = 'all' | 'active' | 'draft' | 'pendingReview' | 'rejected' | 'outOfStock'
type ViewMode = 'list' | 'grid'

const VIEW_STORAGE_KEY = 'vendor.catalog.view'

const FILTERS: { key: FilterKey; labelKey: TranslationKeys }[] = [
  { key: 'all',           labelKey: 'vendor.productsList.filterAll' },
  { key: 'active',        labelKey: 'vendor.productsList.filterActive' },
  { key: 'draft',         labelKey: 'vendor.productsList.filterDraft' },
  { key: 'pendingReview', labelKey: 'vendor.productsList.filterPendingReview' },
  { key: 'rejected',      labelKey: 'vendor.productsList.filterRejected' },
  { key: 'outOfStock',    labelKey: 'vendor.productsList.filterOutOfStock' },
]

function matchesFilter(product: ProductWithCategory, filter: FilterKey): boolean {
  switch (filter) {
    case 'all':           return true
    case 'active':        return product.status === 'ACTIVE'
    case 'draft':         return product.status === 'DRAFT'
    case 'pendingReview': return product.status === 'PENDING_REVIEW'
    case 'rejected':      return product.status === 'REJECTED'
    case 'outOfStock':    return product.trackStock && product.stock === 0
  }
}

interface Props {
  products: ProductWithCategory[]
}

export function VendorProductListClient({ products }: Props) {
  const t = useT()
  const now = new Date()

  const [view, setView] = useState<ViewMode>('list')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY)
      if (stored === 'grid' || stored === 'list') setView(stored)
    } catch { /* ignore */ }
  }, [])

  function updateView(next: ViewMode) {
    setView(next)
    try { window.localStorage.setItem(VIEW_STORAGE_KEY, next) } catch { /* ignore */ }
  }

  const lowStock = products.filter(p => p.trackStock && p.stock > 0 && p.stock <= 5)
  const outOfStock = products.filter(p => p.trackStock && p.stock === 0 && p.status === 'ACTIVE')
  const expired = products.filter(product => isProductExpired(product.expiresAt, now))

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return products.filter(p => {
      if (!matchesFilter(p, filter)) return false
      if (needle && !p.name.toLowerCase().includes(needle)) return false
      return true
    })
  }, [products, filter, query])

  const hasActiveFilters = filter !== 'all' || query.trim() !== ''

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
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
        <>
          {/* Toolbar: search + view toggle */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted)]" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('vendor.productsList.searchPlaceholder')}
                aria-label={t('vendor.productsList.searchPlaceholder')}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-9 pr-9 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t('vendor.productsList.clearFilters')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            <div
              role="group"
              aria-label={t('vendor.productsList.viewList')}
              className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5"
            >
              <button
                type="button"
                onClick={() => updateView('list')}
                aria-pressed={view === 'list'}
                aria-label={t('vendor.productsList.viewList')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition ${
                  view === 'list'
                    ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-gray-950'
                    : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <ListBulletIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => updateView('grid')}
                aria-pressed={view === 'grid'}
                aria-label={t('vendor.productsList.viewGrid')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition ${
                  view === 'grid'
                    ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-gray-950'
                    : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <Squares2X2Icon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map(f => {
              const active = filter === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  aria-pressed={active}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    active
                      ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-gray-950'
                      : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]'
                  }`}
                >
                  {t(f.labelKey)}
                </button>
              )
            })}
            <span className="ml-auto text-xs text-[var(--muted)]">
              {filtered.length === 1
                ? t('vendor.productsList.resultsCountOne')
                : t('vendor.productsList.resultsCountOther').replace('{count}', String(filtered.length))}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-[var(--border)] py-12 text-center">
              <p className="text-[var(--muted)] mb-3">{t('vendor.productsList.noResults')}</p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => { setFilter('all'); setQuery('') }}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]"
                >
                  <XMarkIcon className="h-4 w-4" /> {t('vendor.productsList.clearFilters')}
                </button>
              )}
            </div>
          ) : view === 'list' ? (
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
              <div className="divide-y divide-[var(--border)]">
                {filtered.map(product => (
                  <ProductListRow key={product.id} product={product} now={now} />
                ))}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(product => (
                <ProductGridCard key={product.id} product={product} now={now} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function QuickStockStepper({
  product,
  layout,
}: {
  product: ProductWithCategory
  layout: 'list' | 'grid'
}) {
  const t = useT()
  const router = useRouter()
  const [stock, setStock] = useState(product.stock)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setStock(product.stock)
  }, [product.stock])

  function apply(delta: number) {
    if (pending) return
    if (delta < 0 && stock + delta < 0) return
    const optimistic = Math.max(0, stock + delta)
    setStock(optimistic)
    setError(null)
    startTransition(async () => {
      try {
        const result = await adjustProductStock({ productId: product.id, delta })
        setStock(result.stock)
        router.refresh()
      } catch (err) {
        setStock(product.stock)
        setError(err instanceof Error ? err.message : t('vendor.quickStock.error'))
      }
    })
  }

  const tone =
    stock === 0
      ? 'text-red-600 dark:text-red-400'
      : stock <= 5
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-[var(--muted)]'

  const stepperClass = layout === 'grid' ? 'gap-1' : 'gap-1.5'
  const buttonClass =
    'inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30'

  return (
    <div className={layout === 'grid' ? 'flex flex-col gap-1' : 'flex flex-col items-end gap-0.5'}>
      <div className={`flex items-center ${stepperClass}`} aria-busy={pending || undefined}>
        <button
          type="button"
          onClick={() => apply(-1)}
          disabled={pending || stock === 0}
          aria-label={t('vendor.quickStock.decrement').replace('{name}', product.name)}
          className={buttonClass}
        >
          <MinusIcon className="h-3.5 w-3.5" />
        </button>
        <span
          className={`min-w-[3.5rem] text-center text-sm font-semibold tabular-nums ${tone}`}
          aria-live="polite"
        >
          {stock === 0 ? t('vendor.noStock') : `${stock} ${t('vendor.inStock')}`}
        </span>
        <button
          type="button"
          onClick={() => apply(1)}
          disabled={pending}
          aria-label={t('vendor.quickStock.increment').replace('{name}', product.name)}
          className={buttonClass}
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function QuickSubmitButton({ productId }: { productId: string }) {
  const t = useT()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      await submitForReview(productId)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('vendor.productActions.sendError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-busy={loading || undefined}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
      >
        <PaperAirplaneIcon className="h-3.5 w-3.5" />
        {loading ? t('vendor.productActions.sending') : t('vendor.productActions.sendReview')}
      </button>
      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

function ProductListRow({ product, now }: { product: ProductWithCategory; now: Date }) {
  const t = useT()
  const statusEntry = STATUS_CONFIG[product.status]
  const statusLabel = statusEntry ? t(statusEntry.labelKey) : product.status
  const statusVariant: BadgeVariant = statusEntry?.variant ?? 'default'
  const expirationTone = getExpirationTone(product.expiresAt, now)
  const expirationLabel = formatExpirationLabel(product.expiresAt, now)
  const canQuickSubmit = product.status === 'DRAFT' || product.status === 'REJECTED'

  return (
    <div className="flex items-center gap-4 p-4 transition-colors hover:bg-[var(--surface-raised)]">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)]">
        {product.images?.[0]
          ? <Image src={product.images[0]} alt={product.name} fill className="object-cover" sizes="64px" />
          : <div className="flex h-full items-center justify-center text-2xl">🌿</div>}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
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
        {product.trackStock && product.variants.length === 0 ? (
          <QuickStockStepper product={product} layout="list" />
        ) : product.trackStock ? (
          <p className={`text-sm font-medium ${
            product.stock === 0 ? 'text-red-600 dark:text-red-400' :
            product.stock <= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--muted)]'
          }`}>
            {product.stock === 0 ? t('vendor.noStock') : `${product.stock} ${t('vendor.inStock')}`}
          </p>
        ) : null}
      </div>

      {canQuickSubmit && <QuickSubmitButton productId={product.id} />}

      <Link
        href={`/vendor/productos/${product.id}`}
        aria-label={t('vendor.productActions.edit')}
        className="shrink-0 rounded-lg p-2 text-[var(--muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
      >
        <PencilSquareIcon className="h-5 w-5" />
      </Link>

      <ProductActions product={product} />
    </div>
  )
}

function ProductGridCard({ product, now }: { product: ProductWithCategory; now: Date }) {
  const t = useT()
  const statusEntry = STATUS_CONFIG[product.status]
  const statusLabel = statusEntry ? t(statusEntry.labelKey) : product.status
  const statusVariant: BadgeVariant = statusEntry?.variant ?? 'default'
  const expirationTone = getExpirationTone(product.expiresAt, now)
  const canQuickSubmit = product.status === 'DRAFT' || product.status === 'REJECTED'

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--surface-raised)]">
        {product.images?.[0]
          ? <Image src={product.images[0]} alt={product.name} fill className="object-cover transition group-hover:scale-[1.02]" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
          : <div className="flex h-full items-center justify-center text-5xl">🌿</div>}
        <div className="absolute right-2 top-2">
          <ProductActions product={product} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-[var(--foreground)] leading-snug line-clamp-2">{product.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={statusVariant}>{statusLabel}</Badge>
          {expirationTone === 'expired' && <Badge variant="red">{t('vendor.expired')}</Badge>}
          {expirationTone === 'today' && <Badge variant="amber">{t('vendor.expiresToday')}</Badge>}
          {expirationTone === 'soon' && <Badge variant="amber">{t('vendor.expiresSoon')}</Badge>}
        </div>
        <p className="text-sm text-[var(--muted)]">
          {formatPrice(Number(product.basePrice))} / {product.unit}
        </p>
        {product.trackStock && product.variants.length === 0 ? (
          <QuickStockStepper product={product} layout="grid" />
        ) : product.trackStock ? (
          <p className={`text-xs font-medium ${
            product.stock === 0 ? 'text-red-600 dark:text-red-400' :
            product.stock <= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--muted)]'
          }`}>
            {product.stock === 0 ? t('vendor.noStock') : `${product.stock} ${t('vendor.inStock')}`}
          </p>
        ) : null}
        <div className="mt-auto flex items-center gap-2 pt-2">
          <Link
            href={`/vendor/productos/${product.id}`}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)]"
          >
            <PencilSquareIcon className="h-4 w-4" /> {t('vendor.productActions.edit')}
          </Link>
          {canQuickSubmit && <QuickSubmitButton productId={product.id} />}
        </div>
      </div>
    </div>
  )
}
