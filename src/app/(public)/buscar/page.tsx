import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getProducts, getCategories } from '@/domains/catalog/queries'
import { ProductCard } from '@/components/catalog/ProductCard'
import { ProductFiltersPanel } from '@/components/catalog/ProductFiltersPanel'
import { SortSelect } from '@/components/catalog/SortSelect'
import { parseProductSort, type ProductWithVendor } from '@/domains/catalog/types'
import Link from 'next/link'

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
  const params = await searchParams
  const query = params.q || ''

  return {
    title: `Buscar: ${query} | Mercado Productor`,
    description: `Resultados de búsqueda para "${query}" en Mercado Productor`,
  }
}

export default async function BuscarPage({ searchParams }: Props) {
  const params = await searchParams

  if (!params.q || params.q.trim() === '') {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-blue-50 p-8 text-center">
          <p className="text-lg font-semibold text-blue-900">¿Qué estás buscando?</p>
          <p className="mt-2 text-blue-700">Usa el campo de búsqueda para encontrar productos</p>
          <Link
            href="/productos"
            className="mt-4 inline-block text-emerald-600 hover:underline"
          >
            Ver todos los productos
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
                Resultados para "{params.q}"
              </h1>
              <p className="text-sm text-[var(--muted)] mt-0.5">
                {products.length} resultado{products.length !== 1 ? 's' : ''}{hasNext ? '+' : ''}
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
                No encontramos productos para "{params.q}"
              </p>
              <p className="text-sm text-[var(--muted)] mt-1 mb-6">
                Prueba con otros términos de búsqueda o explora por categoría
              </p>
              <div className="flex flex-col gap-3 sm:flex-row justify-center">
                <Link
                  href="/productos"
                  className="inline-block rounded-lg bg-emerald-600 px-6 py-2 font-semibold text-white hover:bg-emerald-700"
                >
                  Ver todos los productos
                </Link>
                <Link
                  href="/productos?categoria=frutas"
                  className="inline-block rounded-lg border-2 border-emerald-600 px-6 py-2 font-semibold text-emerald-600 hover:bg-emerald-50"
                >
                  Explorar por categoría
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {products.map(p => (
                  <ProductCard key={p.id} product={p as ProductWithVendor} />
                ))}
              </div>

              {/* Cursor-based pagination */}
              {(hasPrev || hasNext) && (
                <div className="mt-10 flex justify-center gap-3">
                  {hasPrev && (
                    <a
                      href={`?q=${encodeURIComponent(params.q || '')}${params.categoria ? `&categoria=${params.categoria}` : ''}${params.orden ? `&orden=${params.orden}` : ''}`}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      ← Anterior
                    </a>
                  )}
                  {hasNext && (
                    <a
                      href={`?q=${encodeURIComponent(params.q || '')}&cursor=${nextCursor}${params.categoria ? `&categoria=${params.categoria}` : ''}${params.orden ? `&orden=${params.orden}` : ''}`}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Siguiente →
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
