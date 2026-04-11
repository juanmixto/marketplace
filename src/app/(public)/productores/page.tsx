import Link from 'next/link'
import type { Metadata } from 'next'
import { getVendors } from '@/domains/catalog/queries'
import { MapPinIcon, StarIcon } from '@heroicons/react/24/solid'
import { buildPageMetadata } from '@/lib/seo'

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
        {vendors.map(v => (
          <Link
            key={v.slug}
            href={`/productores/${v.slug}`}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-3xl">
                🌾
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-[var(--foreground)] truncate">{v.displayName}</p>
                {v.location && (
                  <p className="flex items-center gap-1 text-sm text-[var(--muted)] mt-0.5">
                    <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
                    {v.location}
                  </p>
                )}
                {v.avgRating && (
                  <p className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 mt-1">
                    <StarIcon className="h-3.5 w-3.5" />
                    {Number(v.avgRating).toFixed(1)}
                    <span className="text-[var(--muted-light)]">({v.totalReviews})</span>
                  </p>
                )}
              </div>
            </div>
            {v.description && (
              <p className="mt-3 text-sm text-[var(--foreground-soft)] line-clamp-2">{v.description}</p>
            )}
            <p className="mt-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              {v._count.products} producto{v._count.products !== 1 ? 's' : ''} →
            </p>
          </Link>
        ))}
      </div>

      {vendors.length === 0 && (
        <p className="py-16 text-center text-[var(--muted)]">Próximamente...</p>
      )}
    </div>
  )
}
