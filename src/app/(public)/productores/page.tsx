import Link from 'next/link'
import { getVendors } from '@/domains/catalog/queries'
import { MapPinIcon, StarIcon } from '@heroicons/react/24/solid'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Productores' }
export const revalidate = 60

export default async function ProductoresPage() {
  const vendors = await getVendors(50)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-gray-900">Nuestros productores</h1>
      <p className="mt-2 text-gray-500">Conoce a las personas detrás de cada producto</p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {vendors.map(v => (
          <Link
            key={v.slug}
            href={`/productores/${v.slug}`}
            className="rounded-2xl border border-gray-200 bg-white p-5 hover:border-emerald-300 hover:shadow-sm transition"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-3xl">
                🌾
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{v.displayName}</p>
                {v.location && (
                  <p className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
                    <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
                    {v.location}
                  </p>
                )}
                {v.avgRating && (
                  <p className="flex items-center gap-1 text-sm text-amber-600 mt-1">
                    <StarIcon className="h-3.5 w-3.5" />
                    {Number(v.avgRating).toFixed(1)}
                    <span className="text-gray-400">({v.totalReviews})</span>
                  </p>
                )}
              </div>
            </div>
            {v.description && (
              <p className="mt-3 text-sm text-gray-600 line-clamp-2">{v.description}</p>
            )}
            <p className="mt-3 text-sm font-medium text-emerald-600">
              {v._count.products} producto{v._count.products !== 1 ? 's' : ''} →
            </p>
          </Link>
        ))}
      </div>

      {vendors.length === 0 && (
        <p className="py-16 text-center text-gray-500">Próximamente...</p>
      )}
    </div>
  )
}
