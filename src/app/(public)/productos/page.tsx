import { Suspense } from 'react'
import { getProducts, getCategories } from '@/domains/catalog/queries'
import { ProductCard } from '@/components/catalog/ProductCard'
import { ProductFiltersPanel } from '@/components/catalog/ProductFiltersPanel'
import { SortSelect } from '@/components/catalog/SortSelect'
import { parseProductSort, type ProductWithVendor } from '@/domains/catalog/types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Productos' }

interface Props {
  searchParams: Promise<{
    q?: string
    categoria?: string
    cert?: string | string[]
    orden?: string
    cursor?: string
  }>
}

export default async function ProductosPage({ searchParams }: Props) {
  const params = await searchParams
  const certs = params.cert
    ? Array.isArray(params.cert) ? params.cert : [params.cert]
    : []

  const { products, nextCursor, hasNext, hasPrev } = await getProducts({
    q: params.q,
    categorySlug: params.categoria,
    certifications: certs,
    sort: parseProductSort(params.orden),
    cursor: params.cursor,
  })

  const categories = await getCategories()

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex gap-8">
        {/* Sidebar filters */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <Suspense fallback={null}>
            <ProductFiltersPanel categories={categories} />
          </Suspense>
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-[var(--foreground)]">
                {params.q ? `"${params.q}"` : params.categoria ? categories.find(c => c.slug === params.categoria)?.name ?? 'Productos' : 'Todos los productos'}
              </h1>
              <p className="text-sm text-[var(--muted)] mt-0.5">{products.length} resultado{products.length !== 1 ? 's' : ''}{hasNext ? '+' : ''}</p>
            </div>
            <Suspense fallback={null}>
              <SortSelect current={params.orden} />
            </Suspense>
          </div>

          {products.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-5xl mb-4">🔍</p>
              <p className="font-semibold text-[var(--foreground)]">Sin resultados</p>
              <p className="text-sm text-[var(--muted)] mt-1">Prueba con otros filtros o términos de búsqueda</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {products.map(p => (
                <ProductCard key={p.id} product={p as ProductWithVendor} />
              ))}
            </div>
          )}

          {/* Cursor-based pagination */}
          {(hasPrev || hasNext) && (
            <div className="mt-10 flex justify-center gap-3">
              {hasPrev && (
                <a
                  href={`?${new URLSearchParams(
                    Object.fromEntries(
                      Object.entries({ q: params.q, categoria: params.categoria, orden: params.orden })
                        .filter(([, v]) => v !== undefined) as [string, string][]
                    )
                  )}`}
                  className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] px-4 text-sm font-medium text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
                >
                  ← Anterior
                </a>
              )}
              {hasNext && nextCursor && (
                <a
                  href={`?${new URLSearchParams(
                    Object.fromEntries(
                      Object.entries({ q: params.q, categoria: params.categoria, orden: params.orden, cursor: nextCursor })
                        .filter(([, v]) => v !== undefined) as [string, string][]
                    )
                  )}`}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
                >
                  Siguiente →
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
