import { notFound } from 'next/navigation'
import { getVendorBySlug } from '@/domains/catalog/queries'
import { ProductCard } from '@/components/catalog/ProductCard'
import { MapPinIcon, StarIcon } from '@heroicons/react/24/solid'
import type { Metadata } from 'next'

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const vendor = await getVendorBySlug(slug)
  if (!vendor) return { title: 'Productor no encontrado' }
  return { title: vendor.displayName, description: vendor.description ?? undefined }
}

export default async function VendorPublicPage({ params }: Props) {
  const { slug } = await params
  const vendor = await getVendorBySlug(slug)
  if (!vendor) notFound()

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 mb-8">
        <div className="flex items-start gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-4xl">
            🌾
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{vendor.displayName}</h1>
            {vendor.location && (
              <p className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                <MapPinIcon className="h-4 w-4" /> {vendor.location}
              </p>
            )}
            {vendor.avgRating && (
              <p className="flex items-center gap-1 text-sm text-amber-600 mt-1">
                <StarIcon className="h-4 w-4" />
                {Number(vendor.avgRating).toFixed(1)} · {vendor.totalReviews} valoraciones
              </p>
            )}
            {vendor.description && (
              <p className="mt-3 text-gray-600 leading-relaxed max-w-2xl">{vendor.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Products */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">
        Productos ({vendor.products.length})
      </h2>
      {vendor.products.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {vendor.products.map(p => (
            <ProductCard
              key={p.id}
              product={{ ...p, vendor: { slug: vendor.slug, displayName: vendor.displayName, location: vendor.location } } as any}
            />
          ))}
        </div>
      ) : (
        <p className="text-gray-500">Este productor aún no tiene productos publicados.</p>
      )}
    </div>
  )
}
