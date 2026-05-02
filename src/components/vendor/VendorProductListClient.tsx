'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  PlusIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  Squares2X2Icon,
  ListBulletIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  ArchiveBoxIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline'
import { ProductActions } from '@/components/vendor/ProductActions'
import { setProductStock, submitForReview } from '@/domains/vendors/actions'
import { useT } from '@/i18n'
import type { BadgeVariant } from '@/domains/catalog/types'
import { formatExpirationLabel, getExpirationTone } from '@/domains/catalog/availability'
import type { VendorCatalogItem } from '@/lib/vendor-serialization'

import type { TranslationKeys } from '@/i18n/locales'

const STATUS_CONFIG: Record<string, { labelKey: TranslationKeys; variant: BadgeVariant }> = {
  DRAFT:          { labelKey: 'vendor.productsList.statusDraft',         variant: 'default' },
  PENDING_REVIEW: { labelKey: 'vendor.productsList.statusPendingReview', variant: 'amber' },
  ACTIVE:         { labelKey: 'vendor.productsList.statusActive',        variant: 'green' },
  REJECTED:       { labelKey: 'vendor.productsList.statusRejected',      variant: 'red' },
  SUSPENDED:      { labelKey: 'vendor.productsList.statusSuspended',     variant: 'default' },
}

type FilterKey = 'all' | 'active' | 'draft' | 'pendingReview' | 'rejected' | 'outOfStock' | 'archived'
type ViewMode = 'list' | 'grid'

const VIEW_STORAGE_KEY = 'vendor.catalog.view'

const FILTERS: { key: FilterKey; labelKey: TranslationKeys }[] = [
  { key: 'all',           labelKey: 'vendor.productsList.filterAll' },
  { key: 'active',        labelKey: 'vendor.productsList.filterActive' },
  { key: 'draft',         labelKey: 'vendor.productsList.filterDraft' },
  { key: 'pendingReview', labelKey: 'vendor.productsList.filterPendingReview' },
  { key: 'rejected',      labelKey: 'vendor.productsList.filterRejected' },
  { key: 'outOfStock',    labelKey: 'vendor.productsList.filterOutOfStock' },
  { key: 'archived',      labelKey: 'vendor.productsList.filterArchived' },
]

interface AlertCounts {
  lowStockCount: number
  outOfStockCount: number
  expiredCount: number
  totalActiveCatalog: number
}

interface Props {
  products: VendorCatalogItem[]
  alerts: AlertCounts
  filter: FilterKey
  query: string
  hasNextPage: boolean
  nextCursor: string | null
  isFirstPage: boolean
}

export function VendorProductListClient({
  products,
  alerts,
  filter: serverFilter,
  query: serverQuery,
  hasNextPage,
  nextCursor,
  isFirstPage,
}: Props) {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const now = new Date()

  const [view, setView] = useState<ViewMode>('list')
  // Local search input mirrors the URL param; on submit (Enter / blur)
  // we navigate so the server can re-run the query.
  const [queryInput, setQueryInput] = useState(serverQuery)

  useEffect(() => {
    setQueryInput(serverQuery)
  }, [serverQuery])

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

  function navigateWith(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.delete('cursor') // any filter / search change resets pagination
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') params.delete(key)
      else params.set(key, value)
    }
    const qs = params.toString()
    router.push(qs ? `/vendor/productos?${qs}` : '/vendor/productos')
  }

  function applyQuery() {
    const next = queryInput.trim()
    if (next === serverQuery) return
    navigateWith({ q: next || null })
  }

  function applyFilter(next: FilterKey) {
    if (next === serverFilter) return
    navigateWith({ filter: next === 'all' ? null : next })
  }

  function clearFilters() {
    navigateWith({ filter: null, q: null })
    setQueryInput('')
  }

  // Use the page items directly. Server already applied filter + search.
  const filtered = products
  // Alerts come from the server (computed over the full catalog). Keep
  // the lookup cheap by exposing only the counts; clicking an alert
  // navigates to the appropriate filtered view.
  const hasActiveFilters = serverFilter !== 'all' || serverQuery.trim() !== ''

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('vendor.myCatalog')}</h1>
          <p className="text-sm text-[var(--muted)]">
            {alerts.totalActiveCatalog === 1
              ? t('vendor.productsList.productsOne')
              : t('vendor.productsList.productsOther').replace(
                  '{count}',
                  String(alerts.totalActiveCatalog),
                )}
          </p>
        </div>
        <Link
          href="/vendor/productos/nuevo"
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        >
          <PlusIcon className="h-4 w-4" /> {t('vendor.newProduct')}
        </Link>
      </div>

      {/* Stock alerts — counts only. Clicking a count drills into the
          filtered view; the deep editor links per product no longer
          fit because the catalog is paginated. */}
      {(alerts.lowStockCount > 0 || alerts.outOfStockCount > 0 || alerts.expiredCount > 0) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-800 dark:bg-amber-950/30">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm min-w-0 flex-1 space-y-1.5">
            {alerts.expiredCount > 0 && (
              <p className="font-medium text-amber-900 dark:text-amber-300">
                {alerts.expiredCount === 1
                  ? t('vendor.productsList.expiredCountOne')
                  : t('vendor.productsList.expiredCountOther').replace(
                      '{count}',
                      String(alerts.expiredCount),
                    )}
              </p>
            )}
            {alerts.outOfStockCount > 0 && (
              <p className="font-medium text-amber-900 dark:text-amber-300">
                <button
                  type="button"
                  onClick={() => applyFilter('outOfStock')}
                  className="underline decoration-amber-400/60 underline-offset-2 hover:text-amber-700 hover:decoration-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 dark:hover:text-amber-200"
                >
                  {alerts.outOfStockCount === 1
                    ? t('vendor.productsList.outOfStockCountOne')
                    : t('vendor.productsList.outOfStockCountOther').replace(
                        '{count}',
                        String(alerts.outOfStockCount),
                      )}
                </button>
              </p>
            )}
            {alerts.lowStockCount > 0 && (
              <p className="text-amber-800 dark:text-amber-400">
                {alerts.lowStockCount === 1
                  ? t('vendor.productsList.lowStockCountOne')
                  : t('vendor.productsList.lowStockCountOther').replace(
                      '{count}',
                      String(alerts.lowStockCount),
                    )}
              </p>
            )}
          </div>
        </div>
      )}

      {alerts.totalActiveCatalog === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-[var(--border)] px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            <ArchiveBoxIcon className="h-8 w-8" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('vendor.noProductsTitle')}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">{t('vendor.noProductsBody')}</p>
          <Link href="/vendor/productos/nuevo"
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
            <PlusIcon className="h-4 w-4" /> {t('vendor.addFirstProduct')}
          </Link>
        </div>
      ) : (
        <>
          {/* Toolbar: search + view toggle */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative flex-1 min-w-0 basis-full sm:basis-auto sm:min-w-[220px] sm:flex-initial">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted)]" />
              <input
                type="search"
                value={queryInput}
                onChange={e => setQueryInput(e.target.value)}
                onBlur={applyQuery}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    applyQuery()
                  }
                }}
                placeholder={t('vendor.productsList.searchPlaceholder')}
                aria-label={t('vendor.productsList.searchPlaceholder')}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-9 pr-9 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              />
              {queryInput && (
                <button
                  type="button"
                  onClick={() => {
                    setQueryInput('')
                    navigateWith({ q: null })
                  }}
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
              const active = serverFilter === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => applyFilter(f.key)}
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
                  onClick={clearFilters}
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

          {(hasNextPage || !isFirstPage) && filtered.length > 0 && (
            <nav
              aria-label={t('vendor.productsList.paginationLabel')}
              className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-4"
            >
              {isFirstPage ? (
                <span aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  onClick={() => navigateWith({ cursor: null })}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-raised)]"
                >
                  {t('vendor.productsList.paginationFirst')}
                </button>
              )}
              {hasNextPage && nextCursor ? (
                <button
                  type="button"
                  onClick={() => navigateWith({ cursor: nextCursor })}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-raised)]"
                >
                  {t('vendor.productsList.paginationOlder')}
                </button>
              ) : (
                <span aria-hidden="true" />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  )
}


function QuickStockInput({
  product,
}: {
  product: VendorCatalogItem
}) {
  const t = useT()
  const router = useRouter()
  const [value, setValue] = useState<string>(String(product.stock))
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValue(String(product.stock))
  }, [product.stock])

  function commit() {
    if (pending) return
    const parsed = Math.max(0, Math.floor(Number(value)))
    if (!Number.isFinite(parsed)) {
      setValue(String(product.stock))
      return
    }
    if (parsed === product.stock) {
      setValue(String(product.stock))
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const result = await setProductStock({ productId: product.id, stock: parsed })
        setValue(String(result.stock))
        router.refresh()
      } catch (err) {
        setValue(String(product.stock))
        setError(err instanceof Error ? err.message : t('vendor.quickStock.error'))
      }
    })
  }

  const numeric = Number(value)
  const tone =
    numeric === 0
      ? 'border-red-300 text-red-700 focus:border-red-500 dark:border-red-800 dark:text-red-300'
      : numeric <= 5
        ? 'border-amber-300 text-amber-800 focus:border-amber-500 dark:border-amber-800 dark:text-amber-300'
        : 'border-[var(--border)] text-[var(--foreground)] focus:border-emerald-500'

  return (
    <div className="flex items-center justify-end gap-1.5">
      <label className="relative">
        <span className="sr-only">{t('vendor.quickStock.label').replace('{name}', product.name)}</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          disabled={pending}
          onChange={e => setValue(e.target.value)}
          onFocus={e => e.currentTarget.select()}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.currentTarget as HTMLInputElement).blur()
            } else if (e.key === 'Escape') {
              setValue(String(product.stock))
              ;(e.currentTarget as HTMLInputElement).blur()
            }
          }}
          className={`h-8 w-16 rounded-md border bg-[var(--surface)] px-2 text-right text-sm font-semibold tabular-nums shadow-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${tone}`}
        />
        {pending && (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 animate-pulse rounded-full bg-emerald-500"
          />
        )}
      </label>
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
    <div className="relative flex flex-col items-end">
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
      {error && (
        <p
          role="alert"
          className="absolute right-0 top-full z-20 mt-1 max-w-[16rem] rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] leading-snug text-red-700 shadow-md dark:border-red-900/60 dark:bg-gray-900 dark:text-red-300"
        >
          {error}
        </p>
      )}
    </div>
  )
}

function ProductListRow({ product, now }: { product: VendorCatalogItem; now: Date }) {
  const t = useT()
  const statusEntry = STATUS_CONFIG[product.status]
  const statusLabel = statusEntry ? t(statusEntry.labelKey) : product.status
  const statusVariant: BadgeVariant = statusEntry?.variant ?? 'default'
  const expirationTone = getExpirationTone(product.expiresAt, now)
  const expirationLabel = formatExpirationLabel(product.expiresAt, now)
  const isArchived = !!product.archivedAt
  const canQuickSubmit = !isArchived && (product.status === 'DRAFT' || product.status === 'REJECTED')

  return (
    <div className="group relative gap-4 p-4 transition-colors hover:bg-[var(--surface-raised)] sm:flex sm:items-center">
      {/* Stretched link covering the whole row — buyer preview */}
      <Link
        href={`/vendor/productos/${product.id}/preview`}
        aria-label={t('vendor.preview.ariaOpen').replace('{name}', product.name)}
        className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
      >
        <span className="sr-only">{t('vendor.preview.ariaOpen').replace('{name}', product.name)}</span>
      </Link>

      {/* Mobile-only: overflow menu pinned to top-right so it doesn't compete
          with the primary CTA on the second row. On sm+, the menu lives in
          the action cluster (rendered below) for desktop alignment. */}
      <div className="absolute right-2 top-2 z-[3] sm:hidden">
        <ProductActions product={product} />
      </div>

      <div className="relative z-[1] flex gap-3 sm:contents">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)] relative">
          {product.images?.[0]
            ? <Image src={product.images[0]} alt={product.name} fill className="object-cover" sizes="64px" />
            : (
              <div className="flex h-full flex-col items-center justify-center gap-0.5 text-[var(--muted)]">
                <PhotoIcon className="h-5 w-5" aria-hidden="true" />
                <span className="text-[9px] font-medium uppercase tracking-wide">{t('vendor.productActions.noImage')}</span>
              </div>
            )}
        </div>

        <div className="flex-1 min-w-0 pointer-events-none pr-10 sm:pr-0">
          <p className={`font-medium break-words ${isArchived ? 'text-[var(--muted)]' : 'text-[var(--foreground)]'}`}>{product.name}</p>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            {isArchived
              ? <Badge variant="default">{t('vendor.productActions.archivedBadge')}</Badge>
              : <Badge variant={statusVariant}>{statusLabel}</Badge>}
            {!isArchived && expirationTone === 'expired' && <Badge variant="red">{t('vendor.expired')}</Badge>}
            {!isArchived && expirationTone === 'today' && <Badge variant="amber">{t('vendor.expiresToday')}</Badge>}
            {!isArchived && expirationTone === 'soon' && <Badge variant="amber">{t('vendor.expiresSoon')}</Badge>}
          </div>
          <p className="text-sm text-[var(--muted)] mt-1">
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
            <p className="text-xs text-red-600 dark:text-red-400 mt-1 break-words">
              {t('vendor.productsList.rejectionReason').replace('{reason}', product.rejectionNote)}
            </p>
          )}
        </div>
      </div>

      <div className="relative z-[2] mt-3 flex flex-wrap items-center justify-end gap-2 sm:mt-0 sm:flex-nowrap sm:shrink-0">
        {product.trackStock && product.variants.length === 0 ? (
          <QuickStockInput product={product} />
        ) : product.trackStock ? (
          <p className={`text-sm font-medium ${
            product.stock === 0 ? 'text-red-600 dark:text-red-400' :
            product.stock <= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--muted)]'
          }`}>
            {product.stock === 0 ? t('vendor.noStock') : `${product.stock} ${t('vendor.inStock')}`}
          </p>
        ) : null}

        {canQuickSubmit && <QuickSubmitButton productId={product.id} />}

        <div className="hidden sm:block">
          <ProductActions product={product} />
        </div>
      </div>
    </div>
  )
}

function ProductGridCard({ product, now }: { product: VendorCatalogItem; now: Date }) {
  const t = useT()
  const statusEntry = STATUS_CONFIG[product.status]
  const statusLabel = statusEntry ? t(statusEntry.labelKey) : product.status
  const statusVariant: BadgeVariant = statusEntry?.variant ?? 'default'
  const expirationTone = getExpirationTone(product.expiresAt, now)
  const isArchived = !!product.archivedAt
  const canQuickSubmit = !isArchived && (product.status === 'DRAFT' || product.status === 'REJECTED')

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm transition hover:shadow-md">
      <Link
        href={`/vendor/productos/${product.id}/preview`}
        aria-label={t('vendor.preview.ariaOpen').replace('{name}', product.name)}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
      >
        <span className="sr-only">{t('vendor.preview.ariaOpen').replace('{name}', product.name)}</span>
      </Link>

      <div className="relative z-[1] aspect-[4/3] w-full overflow-hidden bg-[var(--surface-raised)] pointer-events-none">
        {product.images?.[0]
          ? <Image src={product.images[0]} alt={product.name} fill className="object-cover transition group-hover:scale-[1.02]" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
          : (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 text-[var(--muted)]">
              <PhotoIcon className="h-10 w-10" aria-hidden="true" />
              <span className="text-xs font-medium uppercase tracking-wide">{t('vendor.productActions.noImage')}</span>
            </div>
          )}
        <div className="absolute right-2 top-2 z-[2] pointer-events-auto">
          <ProductActions product={product} />
        </div>
      </div>
      <div className="relative z-[1] flex flex-1 flex-col gap-2 p-4 pointer-events-none">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-[var(--foreground)] leading-snug line-clamp-2">{product.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {isArchived
            ? <Badge variant="default">{t('vendor.productActions.archivedBadge')}</Badge>
            : <Badge variant={statusVariant}>{statusLabel}</Badge>}
          {!isArchived && expirationTone === 'expired' && <Badge variant="red">{t('vendor.expired')}</Badge>}
          {!isArchived && expirationTone === 'today' && <Badge variant="amber">{t('vendor.expiresToday')}</Badge>}
          {!isArchived && expirationTone === 'soon' && <Badge variant="amber">{t('vendor.expiresSoon')}</Badge>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm text-[var(--muted)]">
            {formatPrice(Number(product.basePrice))} / {product.unit}
          </p>
          {product.trackStock && product.variants.length === 0 ? (
            <div className="relative z-[2] shrink-0 pointer-events-auto">
              <QuickStockInput product={product} />
            </div>
          ) : product.trackStock ? (
            <p className={`shrink-0 text-xs font-medium ${
              product.stock === 0 ? 'text-red-600 dark:text-red-400' :
              product.stock <= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--muted)]'
            }`}>
              {product.stock === 0 ? t('vendor.noStock') : `${product.stock} ${t('vendor.inStock')}`}
            </p>
          ) : null}
        </div>
        <div className="relative z-[2] mt-auto flex items-center gap-2 pt-2 pointer-events-auto">
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
