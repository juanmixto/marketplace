import { Suspense } from 'react'
import { getProducts, getCategories } from '@/domains/catalog/queries'
import { ProductCard } from '@/components/catalog/ProductCard'
import { ProductFiltersPanel } from '@/components/catalog/ProductFiltersPanel'
import { parseProductSort, type ProductWithVendor } from '@/domains/catalog/types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Productos' }

interface Props {
  searchParams: Promise<{
    q?: string
    categoria?: string
    cert?: string | string[]
    orden?: string
    pagina?: string
  }>
}

export default async function ProductosPage({ searchParams }: Props) {
  const params = await searchParams
  const certs = params.cert
    ? Array.isArray(params.cert) ? params.cert : [params.cert]
    : []

  const { products, total, page, totalPages } = await getProducts({
    q: params.q,
    categorySlug: params.categoria,
    certifications: certs,
    sort: parseProductSort(params.orden),
    page: params.pagina ? parseInt(params.pagina) : 1,
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
              <h1 className="text-2xl font-bold text-gray-900">
                {params.q ? `"${params.q}"` : params.categoria ? categories.find(c => c.slug === params.categoria)?.name ?? 'Productos' : 'Todos los productos'}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">{total} resultado{total !== 1 ? 's' : ''}</p>
            </div>
            <Suspense fallback={null}>
              <SortSelect current={params.orden} />
            </Suspense>
          </div>

          {products.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-4xl mb-3">🔍</p>
              <p className="font-medium text-gray-700">Sin resultados</p>
              <p className="text-sm text-gray-500 mt-1">Prueba con otros filtros o términos de búsqueda</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {products.map(p => (
                <ProductCard key={p.id} product={p as ProductWithVendor} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-10 flex justify-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                <a
                  key={n}
                  href={`?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]), pagina: String(n) })}`}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition ${
                    n === page
                      ? 'bg-emerald-600 text-white'
                      : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {n}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SortSelect({ current }: { current?: string }) {
  const options = [
    { value: 'newest', label: 'Más recientes' },
    { value: 'price_asc', label: 'Precio: menor a mayor' },
    { value: 'price_desc', label: 'Precio: mayor a menor' },
    { value: 'popular', label: 'Más populares' },
  ]
  return (
    <form>
      <select
        name="orden"
        defaultValue={current ?? 'newest'}
        onChange={e => {
          const form = e.target.closest('form') as HTMLFormElement
          form?.requestSubmit()
        }}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </form>
  )
}
