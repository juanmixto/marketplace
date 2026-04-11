import { notFound } from 'next/navigation'
import { getVendorBySlug } from '@/domains/catalog/queries'
import { ProductCard } from '@/components/catalog/ProductCard'
import type { ProductWithVendor } from '@/domains/catalog/types'
import { MapPinIcon, StarIcon } from '@heroicons/react/24/solid'
import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { VendorReviewsSection } from './VendorReviewsSection'
import { JsonLd } from '@/components/seo/JsonLd'
import { absoluteUrl, buildPageMetadata } from '@/lib/seo'

interface Props { params: Promise<{ slug: string }> }

export const revalidate = 300

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const vendor = await getVendorBySlug(slug)
  if (!vendor) {
    return buildPageMetadata({
      title: 'Productor no encontrado',
      description: 'No hemos podido encontrar este productor.',
      path: `/productores/${slug}`,
      noindex: true,
    })
  }

  return buildPageMetadata({
    title: vendor.displayName,
    description: vendor.description ?? `Conoce a ${vendor.displayName}, productor local en Mercado Productor.`,
    path: `/productores/${vendor.slug}`,
    imagePath: vendor.logo ?? '/opengraph-image',
  })
}

export default async function VendorPublicPage({ params }: Props) {
  const { slug } = await params
  const vendor = await getVendorBySlug(slug)
  if (!vendor) notFound()

  // Cargar reseñas del vendedor
  const [reviews, aggregate] = await Promise.all([
    db.review.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        rating: true,
        body: true,
        createdAt: true,
        customer: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        product: {
          select: {
            name: true,
          },
        },
      },
    }),
    db.review.aggregate({
      where: { vendorId: vendor.id },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ])
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: vendor.displayName,
    description: vendor.description ?? undefined,
    url: absoluteUrl(`/productores/${vendor.slug}`),
    image: vendor.logo ? [absoluteUrl(vendor.logo)] : undefined,
    address: vendor.location
      ? {
          '@type': 'PostalAddress',
          addressLocality: vendor.location,
          addressCountry: 'ES',
        }
      : undefined,
    aggregateRating: vendor.avgRating
      ? {
          '@type': 'AggregateRating',
          ratingValue: Number(vendor.avgRating).toFixed(1),
          reviewCount: vendor.totalReviews,
        }
      : undefined,
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd data={structuredData} />
      {/* Header */}
      <div className="mb-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="flex items-start gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-4xl">
            🌾
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">{vendor.displayName}</h1>
            {vendor.location && (
              <p className="flex items-center gap-1 text-sm text-[var(--muted)] mt-1">
                <MapPinIcon className="h-4 w-4" /> {vendor.location}
              </p>
            )}
            {vendor.avgRating && (
              <p className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 mt-1">
                <StarIcon className="h-4 w-4" />
                {Number(vendor.avgRating).toFixed(1)} · {vendor.totalReviews} valoraciones
              </p>
            )}
            {vendor.description && (
              <p className="mt-3 text-[var(--foreground-soft)] leading-relaxed max-w-2xl">{vendor.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Products */}
      <h2 className="mb-4 text-xl font-bold text-[var(--foreground)]">
        Productos ({vendor.products.length})
      </h2>
      {vendor.products.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {vendor.products.map(p => (
            <ProductCard
              key={p.id}
              product={{
                ...p,
                vendor: {
                  slug: vendor.slug,
                  displayName: vendor.displayName,
                  location: vendor.location,
                },
              } as ProductWithVendor}
            />
          ))}
        </div>
      ) : (
        <p className="text-[var(--muted)]">Este productor aún no tiene productos publicados.</p>
      )}

      {/* Reviews */}
      {reviews.length > 0 && (
        <div className="mb-8 mt-12">
          <h2 className="mb-6 text-xl font-bold text-[var(--foreground)]">
            Reseñas ({aggregate._count._all})
          </h2>
          <VendorReviewsSection
            reviews={reviews}
            avgRating={aggregate._avg.rating ? Number(aggregate._avg.rating) : null}
            totalReviews={aggregate._count._all}
          />
        </div>
      )}
    </div>
  )
}
