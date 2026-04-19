import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { getVendorBySlug } from '@/domains/catalog/queries'
import { ProductCard } from '@/components/catalog/ProductCard'
import {
  MapPinIcon,
  CalendarDaysIcon,
  TruckIcon,
  ClockIcon,
  ShoppingBagIcon,
  CubeIcon,
  HomeModernIcon,
} from '@heroicons/react/24/outline'
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid'
import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { VendorReviewsSection } from './VendorReviewsSection'
import { JsonLd } from '@/components/seo/JsonLd'
import { absoluteUrl, buildPageMetadata } from '@/lib/seo'
import { getServerLocale, getServerT } from '@/i18n/server'
import { getCatalogCopy, getLocalizedCertificationCopy } from '@/i18n/catalog-copy'
import { getVendorHeroImage, getVendorVisualLabelKey } from '@/domains/vendors/visuals'
import { Badge } from '@/components/ui/badge'
import { StarRating } from '@/components/reviews/StarRating'
import { auth } from '@/lib/auth'
import { getVendorPendingReviews } from '@/domains/reviews/pending'
import { VendorReviewPromptCta } from './VendorReviewPromptCta'
import { serializeProductForCard } from '@/lib/catalog-serialization'

interface Props { params: Promise<{ slug: string }> }

// Force dynamic rendering. This page reads cookies via `getServerLocale`
// and session via `auth()`, both dynamic APIs. Previous
// `export const revalidate = 300` silently opted into ISR which
// Next.js 16 rejects at prod runtime with DYNAMIC_SERVER_USAGE
// (see #379).
export const dynamic = 'force-dynamic'

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
  const locale = await getServerLocale()
  const copy = getCatalogCopy(locale)
  const t = await getServerT()
  const vendor = await getVendorBySlug(slug)
  if (!vendor) notFound()

  const heroImage = getVendorHeroImage(vendor)
  const visualLabel = t(getVendorVisualLabelKey(vendor))

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
        customer: { select: { firstName: true } },
        product: { select: { name: true } },
      },
    }),
    db.review.aggregate({
      where: { vendorId: vendor.id },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ])

  const avgRating = aggregate._avg.rating ? Number(aggregate._avg.rating) : null
  const totalReviews = aggregate._count._all

  const session = await auth()
  const pendingForVendor = session?.user?.id
    ? await getVendorPendingReviews(session.user.id, vendor.id)
    : { total: 0, firstPendingOrderId: null }

  // Collect unique certifications across all products
  const allCertifications = [
    ...new Set(vendor.products.flatMap(p => p.certifications)),
  ]

  const memberSinceDate = new Date(vendor.createdAt).toLocaleDateString(
    locale === 'en' ? 'en-GB' : 'es-ES',
    { month: 'long', year: 'numeric' },
  )

  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: copy.breadcrumbs.home, item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: copy.vendor.breadcrumbProducers, item: absoluteUrl('/productores') },
      { '@type': 'ListItem', position: 3, name: vendor.displayName, item: absoluteUrl(`/productores/${vendor.slug}`) },
    ],
  }
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': absoluteUrl(`/productores/${vendor.slug}#business`),
    name: vendor.displayName,
    description: vendor.description ?? undefined,
    url: absoluteUrl(`/productores/${vendor.slug}`),
    image: vendor.logo ? [absoluteUrl(vendor.logo)] : undefined,
    logo: vendor.logo ? absoluteUrl(vendor.logo) : undefined,
    address: vendor.location
      ? { '@type': 'PostalAddress', addressLocality: vendor.location, addressCountry: 'ES' }
      : undefined,
    areaServed: vendor.location
      ? { '@type': 'Place', name: vendor.location }
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
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <JsonLd data={structuredData} />
      <JsonLd data={breadcrumbData} />

      {/* ── Breadcrumb ── */}
      <nav aria-label="Breadcrumb" className="py-4 text-sm text-[var(--muted)]">
        <ol className="flex items-center gap-1.5">
          <li><Link href="/" className="hover:text-[var(--foreground)] transition-colors">{copy.breadcrumbs.home}</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href="/productores" className="hover:text-[var(--foreground)] transition-colors">{copy.vendor.breadcrumbProducers}</Link></li>
          <li aria-hidden="true">/</li>
          <li className="text-[var(--foreground)] font-medium truncate">{vendor.displayName}</li>
        </ol>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden rounded-3xl">
        <div className="relative aspect-[3/1] min-h-[240px] sm:min-h-[300px]">
          <Image
            src={heroImage}
            alt={copy.vendor.heroImageAlt(vendor.displayName)}
            fill
            className="object-cover"
            sizes="(max-width: 1280px) 100vw, 1280px"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

          {/* Visual label badge — solid dark pill so it stays readable on any
              hero image (bright/washed-out photos as well as dark ones). */}
          <span className="absolute left-4 top-4 inline-flex items-center rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white shadow-sm ring-1 ring-white/25 backdrop-blur-sm">
            {visualLabel}
          </span>
        </div>

        {/* Info overlay at the bottom of the hero */}
        <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8">
          <div className="flex items-end gap-4 sm:gap-6">
            {/* Logo */}
            <div className="flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/30 bg-white/10 text-4xl sm:text-5xl backdrop-blur-md shadow-lg">
              {vendor.logo ? (
                <Image
                  src={vendor.logo}
                  alt={copy.vendor.logoAlt(vendor.displayName)}
                  width={96}
                  height={96}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                '🌾'
              )}
            </div>

            <div className="min-w-0 pb-1">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white drop-shadow-md truncate">
                {vendor.displayName}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/80">
                {vendor.location && (
                  <span className="flex items-center gap-1">
                    <MapPinIcon className="h-4 w-4" /> {vendor.location}
                  </span>
                )}
                {avgRating && (
                  <span className="flex items-center gap-1">
                    <StarSolidIcon className="h-4 w-4 text-amber-400" />
                    {copy.vendor.ratingLabel(avgRating.toFixed(1), totalReviews)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust signals bar ── */}
      <section className="mt-5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--foreground-soft)]">
          <CalendarDaysIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          {copy.vendor.memberSinceDate(memberSinceDate)}
        </span>
        {vendor.preparationDays != null && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--foreground-soft)]">
            <TruckIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            {copy.vendor.preparationDays(vendor.preparationDays)}
          </span>
        )}
        {vendor.orderCutoffTime && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--foreground-soft)]">
            <ClockIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            {copy.vendor.orderCutoff(vendor.orderCutoffTime)}
          </span>
        )}
        {allCertifications.map(cert => (
          <Badge key={cert} variant="green">
            {getLocalizedCertificationCopy(cert, locale).label}
          </Badge>
        ))}
      </section>

      {/* ── About / "Nuestra historia" ── */}
      <section className="mt-8 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-[var(--foreground)]">{copy.vendor.aboutTitle}</h2>
        <p className="mt-3 text-base sm:text-lg leading-relaxed whitespace-pre-line text-[var(--foreground-soft)]">
          {vendor.description || copy.vendor.aboutEmpty}
        </p>
        <div className="mt-6 border-t border-[var(--border)] pt-5 grid grid-cols-3 gap-4 text-center">
          <div className="flex flex-col items-center gap-1.5">
            <ShoppingBagIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-medium text-[var(--foreground-soft)]">{copy.vendor.trustDirectSale}</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <CubeIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-medium text-[var(--foreground-soft)]">{copy.vendor.trustSmallBatch}</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <HomeModernIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-medium text-[var(--foreground-soft)]">{copy.vendor.trustLocalOrigin}</span>
          </div>
        </div>
      </section>

      {/* ── Products ── */}
      <section className="mt-10">
        <h2 className="mb-5 text-xl font-bold text-[var(--foreground)]">
          {copy.vendor.productsTitle(vendor.products.length)}
        </h2>
        {vendor.products.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {vendor.products.map(p => (
              <ProductCard
                key={p.id}
                locale={locale}
                product={serializeProductForCard({
                  ...p,
                  vendor: {
                    slug: vendor.slug,
                    displayName: vendor.displayName,
                    location: vendor.location,
                  },
                })}
              />
            ))}
          </div>
        ) : (
          <p className="text-[var(--muted)]">{copy.vendor.productsEmpty}</p>
        )}
      </section>

      {/* ── Reviews ── */}
      <section className="mt-10 mb-12">
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 shadow-sm">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-[var(--foreground)]">
              {copy.vendor.reviewsTitle(totalReviews)}
            </h2>
            {avgRating && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5">
                <StarRating rating={avgRating} size="sm" />
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                  {avgRating.toFixed(1)}
                </span>
              </div>
            )}
          </div>
          {pendingForVendor.total > 0 && pendingForVendor.firstPendingOrderId && (
            <VendorReviewPromptCta
              pendingCount={pendingForVendor.total}
              orderId={pendingForVendor.firstPendingOrderId}
            />
          )}
          {totalReviews > 0 ? (
            <VendorReviewsSection
              reviews={reviews}
              avgRating={avgRating}
              totalReviews={totalReviews}
              hideSummary
            />
          ) : (
            pendingForVendor.total === 0 && (
              <p className="text-center text-[var(--muted)] py-4">
                {copy.vendor.noReviews}
              </p>
            )
          )}
        </div>
      </section>
    </div>
  )
}
