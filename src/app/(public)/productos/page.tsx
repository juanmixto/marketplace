import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getProducts, getCategories } from '@/domains/catalog/queries'
import { ProductCard } from '@/components/catalog/ProductCard'
import { ProductFiltersPanel } from '@/components/catalog/ProductFiltersPanel'
import { MobileFilters } from '@/components/catalog/MobileFilters'
import { SortSelect } from '@/components/catalog/SortSelect'
import { parseProductSort } from '@/domains/catalog/types'
import { getCatalogCopy } from '@/i18n/catalog-copy'
import { getServerLocale } from '@/i18n/server'
import { translateCategoryLabel } from '@/lib/portals'
import { buildPageMetadata } from '@/lib/seo'
import { serializeProductForCard } from '@/lib/catalog-serialization'

function hasFacetedQuery(searchParams?: {
  q?: string
  categoria?: string
  cert?: string | string[]
  orden?: string
  cursor?: string
}): boolean {
  if (!searchParams) return false
  return Boolean(
    searchParams.q ||
      searchParams.categoria ||
      searchParams.cert ||
      searchParams.orden ||
      searchParams.cursor,
  )
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: {
    q?: string
    categoria?: string
    cert?: string | string[]
    orden?: string
    cursor?: string
  }
}): Promise<Metadata> {
  const locale = await getServerLocale()
  const copy = getCatalogCopy(locale)

  return buildPageMetadata({
    title: copy.page.title,
    description: copy.page.description,
    path: '/productos',
    noindex: hasFacetedQuery(searchParams),
  })
}

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
  const locale = await getServerLocale()
  const copy = getCatalogCopy(locale)
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
  const selectedCategory = params.categoria
    ? categories.find(category => category.slug === params.categoria)
    : null
  const pageTitle = params.q
    ? `"${params.q}"`
    : selectedCategory
      ? translateCategoryLabel(selectedCategory.slug, selectedCategory.name, locale)
      : copy.page.allProducts

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
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
            <div className="min-w-0 sm:flex-1">
              <h1 className="break-words text-2xl font-bold text-[var(--foreground)] sm:truncate">{pageTitle}</h1>
              <p className="mt-0.5 text-sm text-[var(--muted)]">{copy.page.results(products.length, hasNext)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Suspense fallback={null}>
                <MobileFilters categories={categories} />
              </Suspense>
              <Suspense fallback={null}>
                <SortSelect current={params.orden} />
              </Suspense>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-5xl mb-4">🔍</p>
              <p className="font-semibold text-[var(--foreground)]">{copy.page.noResultsTitle}</p>
              <p className="text-sm text-[var(--muted)] mt-1">{copy.page.noResultsDescription}</p>
            </div>
          ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {products.map(p => (
                <ProductCard key={p.id} product={serializeProductForCard(p)} locale={locale} />
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
                  ← {copy.page.previous}
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
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-medium text-white shadow-sm transition hover:bg-accent-hover dark:bg-accent dark:text-white dark:hover:bg-accent-hover"
                >
                  {copy.page.next} →
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
