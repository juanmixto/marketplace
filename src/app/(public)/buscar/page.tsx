import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getProducts, getCategories } from '@/domains/catalog/queries'
import { ProductCard } from '@/components/catalog/ProductCard'
import { ProductFiltersPanel } from '@/components/catalog/ProductFiltersPanel'
import { TrackEventOnView } from '@/components/analytics/TrackEventOnView'
import { SortSelect } from '@/components/catalog/SortSelect'
import { parseProductSort } from '@/domains/catalog/types'
import Link from 'next/link'
import { getCatalogCopy } from '@/i18n/catalog-copy'
import { getServerLocale } from '@/i18n/server'
import { buildPageMetadata } from '@/lib/seo'
import { serializeProductForCard } from '@/lib/catalog-serialization'

interface Props {
  searchParams: Promise<{
    q?: string
    categoria?: string
    cert?: string | string[]
    orden?: string
    cursor?: string
  }>
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = await getServerLocale()
  const copy = getCatalogCopy(locale)
  const params = await searchParams
  const query = params.q?.trim() || ''

  return buildPageMetadata({
    title: query ? copy.page.searchTitleWithQuery(query) : copy.page.searchTitle,
    description: query
      ? copy.page.searchDescriptionWithQuery(query)
      : copy.page.searchDescription,
    path: '/buscar',
    noindex: true,
  })
}

export default async function BuscarPage({ searchParams }: Props) {
  const locale = await getServerLocale()
  const copy = getCatalogCopy(locale)
  const params = await searchParams

  if (!params.q || params.q.trim() === '') {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-surface-raised p-8 text-center">
          <p className="text-lg font-semibold text-foreground">{copy.page.searchPromptTitle}</p>
          <p className="mt-2 text-foreground-soft">{copy.page.searchPromptDescription}</p>
          <Link
            href="/productos"
            className="mt-4 inline-block text-accent hover:underline"
          >
            {copy.page.browseAllProducts}
          </Link>
        </div>
      </div>
    )
  }

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
      <TrackEventOnView
        event="search"
        payload={{
          search_term: params.q.trim(),
          results_count: products.length,
          has_results: products.length > 0,
        }}
      />
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
                {copy.page.searchResultsFor(params.q)}
              </h1>
              <p className="text-sm text-[var(--muted)] mt-0.5">
                {copy.page.results(products.length, hasNext)}
              </p>
            </div>
            <Suspense fallback={null}>
              <SortSelect current={params.orden} />
            </Suspense>
          </div>

          {products.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-5xl mb-4">🔍</p>
              <p className="font-semibold text-[var(--foreground)]">
                {copy.page.noProductsFor(params.q)}
              </p>
              <p className="text-sm text-[var(--muted)] mt-1 mb-6">
                {copy.page.searchTryAgain}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row justify-center">
                <Link
                  href="/productos"
                  className="inline-block rounded-lg bg-accent px-6 py-2 font-semibold text-white hover:bg-accent-hover"
                >
                  {copy.page.browseAllProducts}
                </Link>
                <Link
                  href="/productos?categoria=frutas"
                  className="inline-block rounded-lg border-2 border-accent px-6 py-2 font-semibold text-accent hover:bg-accent-soft"
                >
                  {copy.page.browseByCategory}
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {products.map(p => (
                  <ProductCard key={p.id} product={serializeProductForCard(p)} locale={locale} />
                ))}
              </div>

              {/* Cursor-based pagination */}
              {(hasPrev || hasNext) && (
                <div className="mt-10 flex justify-center gap-3">
                  {hasPrev && (
                    <a
                      href={`?q=${encodeURIComponent(params.q || '')}${params.categoria ? `&categoria=${params.categoria}` : ''}${params.orden ? `&orden=${params.orden}` : ''}`}
                      className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-raised"
                    >
                      ← {copy.page.previous}
                    </a>
                  )}
                  {hasNext && (
                    <a
                      href={`?q=${encodeURIComponent(params.q || '')}&cursor=${nextCursor}${params.categoria ? `&categoria=${params.categoria}` : ''}${params.orden ? `&orden=${params.orden}` : ''}`}
                      className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                    >
                      {copy.page.next} →
                    </a>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
