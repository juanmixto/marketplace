import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getVendors } from '@/domains/catalog/queries'
import { MapPinIcon, StarIcon } from '@heroicons/react/24/solid'
import { absoluteUrl, buildPageMetadata } from '@/lib/seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { getVendorHeroImage, getVendorVisualLabelKey } from '@/domains/vendors/visuals'
import { getServerT } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT()
  return buildPageMetadata({
    title: t('producersPage.metaTitle'),
    description: t('producersPage.metaDescription'),
    path: '/productores',
  })
}
export const revalidate = 60

export default async function ProductoresPage() {
  const [vendors, t] = await Promise.all([getVendors(50), getServerT()])

  const itemListData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: vendors.map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: absoluteUrl(`/productores/${v.slug}`),
      name: v.displayName,
    })),
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <JsonLd data={itemListData} />
      <h1 className="text-3xl font-bold text-[var(--foreground)]">{t('producersPage.title')}</h1>
      <p className="mt-2 text-[var(--muted)]">{t('producersPage.subtitle')}</p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {vendors.map(v => {
          const heroImage = getVendorHeroImage(v)
          const visualLabel = t(getVendorVisualLabelKey(v))

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

                <span className="absolute bottom-4 right-4 inline-flex items-center rounded-full bg-emerald-400/90 px-3 py-1 text-xs font-semibold text-slate-950 shadow-sm">
                  {v._count.products === 1
                    ? t('producersPage.productCountOne')
                    : t('producersPage.productCountOther').replace('{count}', String(v._count.products))}
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
                  {t('producersPage.viewProducer')} <span aria-hidden>→</span>
                </p>
              </div>
            </Link>
          )
        })}
      </div>

      {vendors.length === 0 && (
        <p className="py-16 text-center text-[var(--muted)]">{t('producersPage.empty')}</p>
      )}
    </div>
  )
}
