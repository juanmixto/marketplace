import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getVendors } from '@/domains/catalog/queries'
import { MapPinIcon, StarIcon } from '@heroicons/react/24/solid'
import { buildPageMetadata } from '@/lib/seo'
import { getVendorHeroImage, getVendorVisualLabel } from '@/lib/vendor-visuals'
import { VendorFavoriteToggleButton } from '@/components/catalog/VendorFavoriteToggleButton'

export const metadata: Metadata = buildPageMetadata({
  title: 'Productores',
  description: 'Conoce a los productores locales que venden en Mercado Productor.',
  path: '/productores',
})
export const revalidate = 60

export default async function ProductoresPage() {
  const vendors = await getVendors(50)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-[var(--foreground)]">Nuestros productores</h1>
      <p className="mt-2 text-[var(--muted)]">Conoce a las personas detrás de cada producto</p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {vendors.map(v => {
          const heroImage = getVendorHeroImage(v)
          const visualLabel = getVendorVisualLabel(v)

          return (
            <Link
              key={v.slug}
              href={`/productores/${v.slug}`}
              className="group overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            >
              <div className="relative h-44 overflow-hidden border-b border-[var(--border)] bg-slate-100 dark:bg-slate-900">
                <Image
                  src={heroImage}
                  alt={`Foto de ${v.displayName}`}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />

                <span className="absolute left-4 top-4 inline-flex items-center rounded-full bg-white/92 px-3 py-1 text-[11px] font-semibold text-slate-800 shadow-sm">
                  {visualLabel}
                </span>

                <div className="absolute right-4 top-4 z-10">
                  <VendorFavoriteToggleButton
                    vendorId={v.id}
                    vendorName={v.displayName}
                    compact
                  />
                </div>

                <span className="absolute bottom-4 right-4 inline-flex items-center rounded-full bg-emerald-400/90 px-3 py-1 text-xs font-semibold text-slate-950 shadow-sm">
                  {v._count.products} producto{v._count.products !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="p-5">
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-[var(--foreground)] transition-colors group-hover:text-emerald-700 dark:group-hover:text-emerald-300">
                    {v.displayName}
                  </p>
                  {v.location && (
                    <p className="mt-1 flex items-center gap-1 text-sm text-[var(--muted)]">
                      <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
                      {v.location}
                    </p>
                  )}
                  {v.avgRating && (
                    <p className="mt-2 flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                      <StarIcon className="h-3.5 w-3.5" />
                      {Number(v.avgRating).toFixed(1)}
                      <span className="text-[var(--muted-light)]">({v.totalReviews})</span>
                    </p>
                  )}
                </div>

                {v.description && (
                  <p className="mt-3 line-clamp-3 text-sm text-[var(--foreground-soft)]">{v.description}</p>
                )}

                <p className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 transition-transform group-hover:translate-x-0.5 dark:text-emerald-400">
                  Ver productor <span aria-hidden>→</span>
                </p>
              </div>
            </Link>
          )
        })}
      </div>

      {vendors.length === 0 && (
        <p className="py-16 text-center text-[var(--muted)]">Próximamente...</p>
      )}
    </div>
  )
}
