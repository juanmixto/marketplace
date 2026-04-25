import Link from 'next/link'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'
import { formatPrice } from '@/lib/utils'
import { AddToCartButton } from '@/components/catalog/AddToCartButton'
import { FavoriteToggleButton } from '@/components/catalog/FavoriteToggleButton'
import { AutoTranslatedBadge } from '@/components/catalog/AutoTranslatedBadge'
import { StarRating } from '@/components/reviews/StarRating'
import {
  getAvailableStockForPurchase,
  getDefaultVariant,
  getVariantAdjustedCompareAtPrice,
  getVariantAdjustedPrice,
} from '@/domains/catalog/variants'
import type { BadgeVariant } from '@/domains/catalog/types'
import type { Locale } from '@/i18n/locales'
import { getCatalogCopy, getLocalizedCertificationCopy, getLocalizedProductCopy } from '@/i18n/catalog-copy'
import { MapPinIcon } from '@heroicons/react/24/outline'

const CERT_COLORS: Record<string, BadgeVariant> = {
  'ECO-ES': 'green',
  DOP: 'blue',
  KM0: 'purple',
  BIO: 'green',
  IGP: 'amber',
}

type DecimalLike = number | { toString(): string }

export interface ProductCardVariant {
  id: string
  name: string
  priceModifier: DecimalLike
  stock: number
  isActive: boolean
}

export interface ProductCardProduct {
  id: string
  vendorId: string
  slug: string
  name: string
  images: string[]
  basePrice: DecimalLike
  compareAtPrice: DecimalLike | null
  stock: number
  trackStock: boolean
  unit: string
  certifications: string[]
  originRegion: string | null
  vendor?: { slug: string; displayName: string; location: string | null }
  category?: { name: string; slug: string } | null
  variants?: ProductCardVariant[]
  /** #324 — enriched by catalog query. Missing / null = no stars rendered. */
  averageRating?: number | null
  totalReviews?: number
}

interface ProductCardProps {
  product: ProductCardProduct
  locale?: Locale
}

export function ProductCard({ product, locale = 'es' }: ProductCardProps) {
  const copy = getCatalogCopy(locale)
  const localizedProduct = getLocalizedProductCopy(product, locale)
  const price = Number(product.basePrice)
  const compareAt = product.compareAtPrice ? Number(product.compareAtPrice) : null
  const variantOptions = (product.variants ?? []).map(variant => ({
    ...variant,
    priceModifier: Number(variant.priceModifier),
  }))
  const purchasableProduct = {
    basePrice: price,
    compareAtPrice: compareAt,
    stock: product.stock,
    trackStock: product.trackStock,
    variants: variantOptions,
  }
  const defaultVariant = getDefaultVariant(purchasableProduct)
  const displayPrice = getVariantAdjustedPrice(price, defaultVariant)
  const displayCompareAt = getVariantAdjustedCompareAtPrice(compareAt, defaultVariant)
  const hasDiscount = displayCompareAt !== null && displayCompareAt > displayPrice
  const discount = hasDiscount ? Math.round(((displayCompareAt! - displayPrice) / displayCompareAt!) * 100) : 0
  const availableStock = getAvailableStockForPurchase(purchasableProduct, defaultVariant)
  const isLowStock = product.trackStock && (availableStock ?? 0) > 0 && (availableStock ?? 0) <= 5
  const isOutOfStock = product.trackStock && availableStock === 0

  return (
    <article
      className={[
        'group flex h-full min-w-0 flex-col rounded-2xl',
        'border border-[var(--border)] bg-[var(--surface)]',
        'shadow-sm hover:border-[var(--border-strong)] hover:shadow-md hover:-translate-y-1',
        'transition-all duration-200',
      ].join(' ')}
    >
      <Link
        href={`/productos/${product.slug}`}
        prefetch={false}
        className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
      >
        <div className="relative aspect-square overflow-hidden rounded-t-2xl bg-[var(--surface-raised)]">
          {product.images?.[0] ? (
            <Image
              src={product.images[0]}
              alt={localizedProduct.name}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              placeholder="blur"
              blurDataURL="data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA0IDMnPjxmaWx0ZXIgaWQ9J2InIGNvbG9yLWludGVycG9sYXRpb24tZmlsdGVycz0nc1JHQic+PGZlR2F1c3NpYW5CbHVyIHN0ZERldmlhdGlvbj0nMC41Jy8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9JzEwMCUnIGhlaWdodD0nMTAwJScgZmlsbD0nI2VlZWVlZScvPjwvc3ZnPg=="
            />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl opacity-30">🌿</div>
          )}

          {hasDiscount && (
            <span className="absolute left-2.5 top-2.5 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
              -{discount}%
            </span>
          )}

          {isOutOfStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
              <span className="rounded-full border border-white/20 bg-white/95 px-3 py-1 text-xs font-semibold text-gray-700 shadow dark:border-white/10 dark:bg-black/80 dark:text-gray-200">
                {copy.actions.outOfStock}
              </span>
            </div>
          )}

          <div className="absolute right-2 top-2 z-10">
            <FavoriteToggleButton
              productId={product.id}
              productName={localizedProduct.name}
              compact
              className="h-8 w-8 rounded-full bg-white/80 shadow-sm backdrop-blur-sm hover:bg-white dark:bg-black/50 dark:hover:bg-black/70"
            />
          </div>
        </div>

        <div className="flex flex-1 flex-col p-4">
          {product.certifications.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {product.certifications.slice(0, 3).map(cert => {
                const certificationCopy = getLocalizedCertificationCopy(cert, locale)

                return (
                  <Tooltip key={cert} content={certificationCopy.description || cert} side="top">
                    <Badge
                      variant={CERT_COLORS[cert] ?? 'default'}
                      className="text-[11px] px-2 py-0.5 font-semibold cursor-pointer transition-all hover:shadow-md hover:scale-105"
                    >
                      {certificationCopy.label}
                    </Badge>
                  </Tooltip>
                )
              })}
              {product.certifications.length > 3 && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                  +{product.certifications.length - 3}
                </span>
              )}
            </div>
          )}

          <p className="line-clamp-2 text-sm font-semibold text-[var(--foreground)] leading-snug">
            {localizedProduct.name}
          </p>

          {product.totalReviews !== undefined
            && product.totalReviews > 0
            && product.averageRating !== null
            && product.averageRating !== undefined && (
            <div
              className="mt-1.5 flex items-center gap-1.5"
              aria-label={copy.reviews.ratingAriaLabel(product.averageRating)}
            >
              <StarRating rating={product.averageRating} size="sm" />
              <span className="text-xs text-[var(--muted)]">
                {copy.reviews.reviewCount(product.totalReviews)}
              </span>
            </div>
          )}

          <div className="mt-2">
            <AutoTranslatedBadge translation={localizedProduct.translation} />
          </div>

          {product.vendor && (
            <div className="mt-1.5 flex min-w-0 items-center gap-1 text-xs text-[var(--muted)]">
              {product.originRegion && (
                <>
                  <MapPinIcon className="h-3 w-3 shrink-0" />
                  <span className="min-w-0 truncate">{product.originRegion}</span>
                  <span className="shrink-0 text-[var(--muted-light)]">·</span>
                </>
              )}
              <span className="min-w-0 truncate">{product.vendor.displayName}</span>
            </div>
          )}

          <div className="mt-auto pt-2.5 flex items-end justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-base font-bold text-[var(--foreground)]">{formatPrice(displayPrice)}</span>
                <span className="text-xs text-[var(--muted)]">/ {localizedProduct.unit}</span>
              </div>
              {hasDiscount && displayCompareAt !== null && (
                <span className="text-xs text-[var(--muted-light)] line-through">{formatPrice(displayCompareAt)}</span>
              )}
            </div>
            {isLowStock && (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                {copy.actions.onlyLeft(availableStock ?? 0)}
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="border-t border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/productos/${product.slug}`}
            prefetch={false}
            className="hidden h-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] px-3 text-sm font-semibold text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] lg:inline-flex"
          >
            {copy.actions.viewDetail}
          </Link>
          <AddToCartButton
            productId={product.id}
            variantId={defaultVariant?.id}
            variantName={defaultVariant?.name}
            productName={localizedProduct.name}
            disabled={isOutOfStock}
            disabledLabel={copy.actions.outOfStock}
            price={displayPrice}
            slug={product.slug}
            image={product.images?.[0]}
            unit={localizedProduct.unit}
            vendorId={product.vendorId}
            vendorName={product.vendor?.displayName ?? ''}
            compact
            size="md"
            className="flex-1 min-w-0 shadow-sm"
          />
        </div>
      </div>
    </article>
  )
}
