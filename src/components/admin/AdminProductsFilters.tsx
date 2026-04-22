'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ProductStatus } from '@/generated/prisma/enums'

const STOCK_OPTIONS = ['all', 'out', 'low', 'in', 'untracked'] as const
type StockFilter = (typeof STOCK_OPTIONS)[number]

const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: 'Borrador',
  PENDING_REVIEW: 'Por revisar',
  ACTIVE: 'Activo',
  REJECTED: 'Rechazado',
  SUSPENDED: 'Suspendido',
}

interface CategoryOption {
  id: string
  name: string
}

interface Props {
  q?: string
  status?: ProductStatus | 'all'
  category?: string
  stock?: StockFilter
  categories: CategoryOption[]
}

const DEBOUNCE_MS = 300

export function AdminProductsFilters({ q, status, category, stock, categories }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const normalizedQuery = q ?? ''
  const normalizedStatus = status ?? 'all'
  const normalizedCategory = category ?? ''
  const normalizedStock = stock ?? 'all'
  const [query, setQuery] = useState(normalizedQuery)
  const [statusValue, setStatusValue] = useState<ProductStatus | 'all'>(normalizedStatus)
  const [categoryValue, setCategoryValue] = useState(normalizedCategory)
  const [stockValue, setStockValue] = useState<StockFilter>(normalizedStock)

  useEffect(() => {
    setQuery(normalizedQuery)
    setStatusValue(normalizedStatus)
    setCategoryValue(normalizedCategory)
    setStockValue(normalizedStock)
  }, [normalizedCategory, normalizedQuery, normalizedStatus, normalizedStock])

  const href = useMemo(
    () => buildProductsFiltersHref({
      q: query || undefined,
      status: statusValue,
      category: categoryValue,
      stock: stockValue,
    }),
    [categoryValue, query, statusValue, stockValue]
  )

  useEffect(() => {
    if (
      query === normalizedQuery &&
      statusValue === normalizedStatus &&
      categoryValue === normalizedCategory &&
      stockValue === normalizedStock
    ) {
      return
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        router.replace(href, { scroll: false })
      })
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [categoryValue, href, normalizedCategory, normalizedQuery, normalizedStatus, normalizedStock, query, router, startTransition, statusValue, stockValue])

  const clearFilters = () => {
    setQuery('')
    setStatusValue('all')
    setCategoryValue('')
    setStockValue('all')
    startTransition(() => {
      router.replace(pathname, { scroll: false })
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] lg:items-end">
        <Input
          name="q"
          label="Buscar"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Nombre, slug o productor"
        />
        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-[var(--foreground-soft)]">Estado</span>
          <select
            name="status"
            value={statusValue}
            onChange={e => setStatusValue(e.target.value as ProductStatus | 'all')}
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="all">Todos</option>
            {(['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'SUSPENDED'] as const).map(option => (
              <option key={option} value={option}>
                {PRODUCT_STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-[var(--foreground-soft)]">Categoría</span>
          <select
            name="category"
            value={categoryValue}
            onChange={e => setCategoryValue(e.target.value)}
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">Todas</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-[var(--foreground-soft)]">Stock</span>
          <select
            name="stock"
            value={stockValue}
            onChange={e => setStockValue(e.target.value as StockFilter)}
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="all">Todo el stock</option>
            <option value="out">Sin stock</option>
            <option value="low">Stock bajo (≤5)</option>
            <option value="in">Con stock</option>
            <option value="untracked">Sin control de stock</option>
          </select>
        </label>
        <Button type="button" variant="secondary" size="md" onClick={clearFilters} disabled={isPending}>
          <ArrowPathIcon className="h-4 w-4" />
          Limpiar
        </Button>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Se aplica automáticamente al escribir o cambiar filtros. La paginación se mantiene en la URL.
      </p>
    </div>
  )
}

function buildProductsFiltersHref(filters: {
  q?: string
  status: ProductStatus | 'all'
  category: string
  stock: StockFilter
}) {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.status && filters.status !== 'all') params.set('status', filters.status)
  if (filters.category) params.set('category', filters.category)
  if (filters.stock && filters.stock !== 'all') params.set('stock', filters.stock)
  const query = params.toString()
  return query ? `/admin/productos?${query}` : '/admin/productos'
}
