import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { getProductBySlug, getProducts } from '@/domains/catalog/queries'
import { Badge } from '@/components/ui/badge'
import { ProductPurchasePanel } from '@/components/catalog/ProductPurchasePanel'
import { AutoTranslatedBadge } from '@/components/catalog/AutoTranslatedBadge'
import { StarRating } from '@/components/reviews/StarRating'
import type { ProductWithVendor } from '@/domains/catalog/types'
import { MapPinIcon, StarIcon, CheckBadgeIcon, TruckIcon, ShieldCheckIcon } from '@heroicons/react/24/solid'
import { ProductImageGallery } from '@/components/catalog/ProductImageGallery'
import { FavoriteToggleButton } from '@/components/catalog/FavoriteToggleButton'
import { ProductCard } from '@/components/catalog/ProductCard'
import { getProductReviews } from '@/domains/reviews/actions'
import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { getAvailableProductWhere } from '@/domains/catalog/availability'
import { JsonLd } from '@/components/seo/JsonLd'
import { absoluteUrl, buildPageMetadata } from '@/lib/seo'
import { getCatalogCopy, getLocalizedCertificationCopy, getLocalizedProductCopy } from '@/i18n/catalog-copy'
import { getServerLocale } from '@/i18n/server'
import { translateCategoryLabel } from '@/lib/portals'

export const revalidate = 300

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await getServerLocale()
  const copy = getCatalogCopy(locale)
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) {
    return buildPageMetadata({
      title: copy.page.productNotFoundTitle,
      description: copy.page.productNotFoundDescription,
      path: `/productos/${slug}`,
      noindex: true,
    })
  }

  const localizedProduct = getLocalizedProductCopy(product, locale)

  return buildPageMetadata({
    title: localizedProduct.name,
    description:
      localizedProduct.description ??
      (locale === 'en'
        ? `Buy ${localizedProduct.name} directly from the producer.`
        : `Compra ${localizedProduct.name} directamente al productor.`),
    path: `/productos/${product.slug}`,
    imagePath: product.images[0] ?? '/opengraph-image',
  })
}

export async function generateStaticParams() {
  const products = await db.product.findMany({
    where: getAvailableProductWhere(),
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { slug: true },
  })

  return products.map(product => ({ slug: product.slug }))
}

const CERT_COLORS: Record<string, 'green' | 'blue' | 'purple' | 'amber'> = {
  'ECO-ES': 'green',
  'DOP': 'blue',
  'KM0': 'purple',
  'BIO': 'green',
  'IGP': 'amber',
}

export default async function ProductDetailPage({ params }: Props) {
  const locale = await getServerLocale()
  const copy = getCatalogCopy(locale)
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) notFound()

  const localizedProduct = getLocalizedProductCopy(product, locale)
  const taxRate = Number(product.taxRate)

  const related = await getProducts({
    categorySlug: product.category?.slug,
    limit: 4,
  }).then(r => r.products.filter(p => p.id !== product.id).slice(0, 4))
  const reviewSummary = await getProductReviews(product.id)
  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: copy.breadcrumbs.home, item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: copy.breadcrumbs.products, item: absoluteUrl('/productos') },
      ...(product.category
        ? [{
            '@type': 'ListItem',
            position: 3,
            name: translateCategoryLabel(product.category.slug, product.category.name, locale),
            item: absoluteUrl(`/productos?categoria=${product.category.slug}`),
          }]
        : []),
      {
        '@type': 'ListItem',
        position: product.category ? 4 : 3,
        name: localizedProduct.name,
        item: absoluteUrl(`/productos/${product.slug}`),
      },
    ],
  }
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: localizedProduct.name,
    description: localizedProduct.description ?? undefined,
    image: product.images.map(image => absoluteUrl(image)),
    sku: product.slug,
    brand: {
      '@type': 'Organization',
      name: product.vendor.displayName,
      url: absoluteUrl(`/productores/${product.vendor.slug}`),
    },
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(`/productos/${product.slug}`),
      priceCurrency: 'EUR',
      price: Number(product.basePrice).toFixed(2),
      availability: product.stock > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd data={structuredData} />
      <JsonLd data={breadcrumbData} />
      {/* Breadcrumb */}
      <nav className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--muted)]">
        <Link href="/" className="rounded-md hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">{copy.breadcrumbs.home}</Link>
        <span>/</span>
        <Link href="/productos" className="rounded-md hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">{copy.breadcrumbs.products}</Link>
        {product.category && (
          <>
            <span>/</span>
            <Link href={`/productos?categoria=${product.category.slug}`} className="rounded-md hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
              {translateCategoryLabel(product.category.slug, product.category.name, locale)}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="min-w-0 truncate text-[var(--foreground)]">{localizedProduct.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Gallery */}
        <ProductImageGallery images={product.images} alt={localizedProduct.name} />

        {/* Info */}
        <div>
          {/* Certs with descriptions */}
          {product.certifications.length > 0 && (
            <div className="mb-4 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {product.certifications.map(cert => (
                  <Badge key={cert} variant={CERT_COLORS[cert] ?? 'default'}>
                    {getLocalizedCertificationCopy(cert, locale).label}
                  </Badge>
                ))}
              </div>
              {product.certifications.length === 1 && (
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  {getLocalizedCertificationCopy(product.certifications[0], locale).description}
                </p>
              )}
            </div>
          )}

          <div className="flex items-start justify-between gap-3">
            <h1 className="text-3xl font-bold text-[var(--foreground)]">{localizedProduct.name}</h1>
            <FavoriteToggleButton
              productId={product.id}
              productName={localizedProduct.name}
              compact
              className="shrink-0 mt-1"
            />
          </div>

          {/* Rating + vendor inline */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {reviewSummary.averageRating && reviewSummary.totalReviews > 0 && (
              <a
                href="#reviews"
                className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-amber-600 dark:hover:text-amber-400"
              >
                <StarIcon className="h-4 w-4 text-amber-400" />
                <span className="font-medium text-[var(--foreground)]">
                  {reviewSummary.averageRating.toFixed(1)}
                </span>
                <span>·</span>
                <span>{copy.product.ratingLabel(reviewSummary.averageRating.toFixed(1), reviewSummary.totalReviews)}</span>
              </a>
            )}
            <Link
              href={`/productores/${product.vendor.slug}`}
              className="inline-flex items-center gap-1.5 rounded-md text-sm text-[var(--muted)] hover:text-emerald-600 dark:hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            >
              {product.originRegion && (
                <>
                  <MapPinIcon className="h-4 w-4" />
                  <span>{product.originRegion}</span>
                  <span>·</span>
                </>
              )}
              <span>{product.vendor.displayName}</span>
            </Link>
          </div>

          <div className="mt-3">
            <AutoTranslatedBadge translation={localizedProduct.translation} variant="full" />
          </div>

          {/* Description */}
          {localizedProduct.description && (
            <p className="mt-5 text-[var(--foreground-soft)] leading-relaxed">{localizedProduct.description}</p>
          )}

          {/* Origin highlight */}
          {product.originRegion && (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <MapPinIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">{copy.product.originTitle}</p>
                <p className="text-sm text-emerald-800 dark:text-emerald-300">
                  {copy.product.originFrom} <span className="font-medium">{product.originRegion}</span>
                  {product.vendor.location && product.vendor.location !== product.originRegion && (
                    <span className="text-emerald-700 dark:text-emerald-400"> · {product.vendor.location}</span>
                  )}
                </p>
              </div>
            </div>
          )}

          <ProductPurchasePanel
            productId={product.id}
            productName={localizedProduct.name}
            slug={product.slug}
            image={product.images[0]}
            unit={localizedProduct.unit}
            vendorId={product.vendor.id}
            vendorName={product.vendor.displayName}
            basePrice={Number(product.basePrice)}
            compareAtPrice={product.compareAtPrice ? Number(product.compareAtPrice) : null}
            taxRate={taxRate}
            trackStock={product.trackStock}
            stock={product.stock}
            variants={product.variants.map(variant => ({
              id: variant.id,
              name: variant.name,
              priceModifier: Number(variant.priceModifier),
              stock: variant.stock,
              isActive: variant.isActive,
            }))}
          />

          {/* Trust strip */}
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-[var(--muted)]">
            <div className="flex flex-col items-center gap-1">
              <TruckIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span>{copy.product.trustDirectPurchase}</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <ShieldCheckIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span>{copy.product.trustQuality}</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <CheckBadgeIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span>{copy.product.trustNoIntermediaries}</span>
            </div>
          </div>

          {/* Vendor card — "Conoce al productor" */}
          <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-sm">
            <div className="bg-gradient-to-r from-emerald-50 to-transparent px-5 py-3 dark:from-emerald-950/30">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                {copy.product.aboutProducer}
              </p>
            </div>
            <div className="flex items-start gap-4 p-5">
              {product.vendor.logo ? (
                <Image
                  src={product.vendor.logo}
                  alt={product.vendor.displayName}
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 rounded-2xl object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-3xl dark:bg-emerald-950/40">
                  🌾
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--foreground)]">{product.vendor.displayName}</p>
                {product.vendor.location && (
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-[var(--muted)]">
                    <MapPinIcon className="h-3.5 w-3.5" />
                    {product.vendor.location}
                  </p>
                )}
                {product.vendor.description && (
                  <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-soft)] line-clamp-3">
                    {product.vendor.description}
                  </p>
                )}
                <Link
                  href={`/productores/${product.vendor.slug}`}
                  className="mt-3 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                >
                  {copy.product.viewProducerProfile}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="mt-16 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[var(--foreground)]">{copy.reviews.title}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {copy.reviews.description}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900/40 dark:bg-amber-950/30">
            <div className="flex items-center gap-3">
              <StarRating rating={reviewSummary.averageRating ?? 0} />
              <div>
                <p className="text-lg font-bold text-[var(--foreground)]">
                  {reviewSummary.averageRating ? reviewSummary.averageRating.toFixed(1) : copy.reviews.unrated}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  {copy.reviews.count(reviewSummary.totalReviews)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {reviewSummary.reviews.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--muted)]">
            {copy.reviews.empty}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {reviewSummary.reviews.map(review => (
              <article key={review.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="font-medium text-[var(--foreground)]">
                        {review.customer.firstName} {review.customer.lastName.slice(0, 1)}.
                      </p>
                      <StarRating rating={review.rating} size="sm" />
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted-light)]">
                      {new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-ES', { dateStyle: 'medium' }).format(review.createdAt)}
                    </p>
                  </div>
                </div>
                {review.body && (
                  <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-soft)]">{review.body}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-6">{copy.reviews.relatedProducts}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {related.map(p => (
              <ProductCard key={p.id} product={p as ProductWithVendor} locale={locale} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
