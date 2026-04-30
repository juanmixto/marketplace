import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  EyeIcon,
  PencilSquareIcon,
  LockClosedIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline'
import { Badge } from '@/components/ui/badge'
import { ProductImageGallery } from '@/components/catalog/ProductImageGallery'
import { ProductPromotions } from '@/components/catalog/ProductPromotions'
import { formatPrice } from '@/lib/utils'
import { getServerLocale, getServerT } from '@/i18n/server'
import type { BadgeVariant } from '@/domains/catalog/types'
import type { TranslationKeys } from '@/i18n/locales'
import type { PublicPromotion } from '@/domains/promotions/public'
import type { VendorProductPreviewItem } from '@/lib/vendor-serialization'

interface Props {
  product: VendorProductPreviewItem
  vendor: {
    id: string
    slug: string
    displayName: string
    description: string | null
    location: string | null
    logo: string | null
    /** #1049 — vendor-supplied alt for the logo image. */
    logoAlt: string | null
    avgRating: number | null
    totalReviews: number
  }
  activePromotions?: PublicPromotion[]
}

const STATUS_UI: Record<
  string,
  { labelKey: TranslationKeys; variant: BadgeVariant; toneKey: TranslationKeys }
> = {
  DRAFT:          { labelKey: 'vendor.productsList.statusDraft',         variant: 'default', toneKey: 'vendor.preview.toneDraft' },
  PENDING_REVIEW: { labelKey: 'vendor.productsList.statusPendingReview', variant: 'amber',   toneKey: 'vendor.preview.tonePendingReview' },
  ACTIVE:         { labelKey: 'vendor.productsList.statusActive',        variant: 'green',   toneKey: 'vendor.preview.toneActive' },
  REJECTED:       { labelKey: 'vendor.productsList.statusRejected',      variant: 'red',     toneKey: 'vendor.preview.toneRejected' },
  SUSPENDED:      { labelKey: 'vendor.productsList.statusSuspended',     variant: 'default', toneKey: 'vendor.preview.toneSuspended' },
}

export async function VendorProductPreview({ product, vendor, activePromotions = [] }: Props) {
  const t = await getServerT()
  const locale = await getServerLocale()
  const statusEntry = STATUS_UI[product.status] ?? STATUS_UI.DRAFT!
  const basePrice = Number(product.basePrice)
  const compareAtPrice = product.compareAtPrice !== null ? Number(product.compareAtPrice) : null
  const hasCompareAt = compareAtPrice !== null && compareAtPrice > basePrice

  // Mirror the customer-facing detail page: an "auto-applied" promo is
  // one a buyer gets without typing a code or hitting a min subtotal,
  // so the price the buyer sees on the product page is already
  // discounted. We surface that same effective price here so the vendor
  // preview matches what real shoppers will see.
  const autoAppliedPromotion =
    activePromotions.find(
      promo =>
        !promo.code &&
        (!promo.minSubtotal || promo.minSubtotal <= 0) &&
        (promo.scope === 'PRODUCT' || promo.scope === 'CATEGORY') &&
        (promo.kind === 'PERCENTAGE' || promo.kind === 'FIXED_AMOUNT'),
    ) ?? null
  const informationalPromotions = activePromotions.filter(
    promo => promo.id !== autoAppliedPromotion?.id,
  )

  const autoDiscountAmount = autoAppliedPromotion
    ? autoAppliedPromotion.kind === 'PERCENTAGE'
      ? Math.min(basePrice, (basePrice * autoAppliedPromotion.value) / 100)
      : Math.min(basePrice, autoAppliedPromotion.value)
    : 0
  const finalPrice = Math.max(0, basePrice - autoDiscountAmount)
  const hasAutoDiscount = autoDiscountAmount > 0
  const savingsPct = hasAutoDiscount ? Math.round((autoDiscountAmount / basePrice) * 100) : 0
  const autoDiscountValidUntil = autoAppliedPromotion
    ? new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-ES', { dateStyle: 'medium' }).format(
        new Date(autoAppliedPromotion.endsAt),
      )
    : null
  const autoDiscountLabel = hasAutoDiscount
    ? locale === 'en'
      ? `Auto-applied promo · −${savingsPct}% until ${autoDiscountValidUntil}`
      : `Promo aplicada automáticamente · −${savingsPct}% hasta ${autoDiscountValidUntil}`
    : null

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Breadcrumb + back */}
      <Link
        href="/vendor/productos"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {t('vendor.preview.backToCatalog')}
      </Link>

      {/* Preview status banner */}
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30"
      >
        <EyeIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">
            {t('vendor.preview.bannerTitle')}
          </p>
          <p className="mt-0.5 text-emerald-800 dark:text-emerald-300">
            {t(statusEntry.toneKey)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xs text-emerald-700 dark:text-emerald-400">
              {t('vendor.preview.currentStatus')}
            </span>
            <Badge variant={statusEntry.variant}>{t(statusEntry.labelKey)}</Badge>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href={`/vendor/productos/${product.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
          >
            <PencilSquareIcon className="h-4 w-4" />
            {t('vendor.productActions.edit')}
          </Link>
          {product.status === 'ACTIVE' && (
            <Link
              href={`/productos/${product.slug}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-gray-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
            >
              {t('vendor.preview.openPublicPage')}
            </Link>
          )}
        </div>
      </div>

      {/* Rendered product view — closely matches the public page */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="grid gap-8 lg:grid-cols-2">
          <ProductImageGallery images={product.images} imageAlts={product.imageAlts} alt={product.name} />

          <div>
            {product.certifications.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {product.certifications.map(cert => (
                  <Badge key={cert} variant="green">
                    {cert}
                  </Badge>
                ))}
              </div>
            )}

            <h1 className="text-3xl font-bold text-[var(--foreground)]">{product.name}</h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
              {product.originRegion && (
                <span className="inline-flex items-center gap-1">
                  <MapPinIcon className="h-4 w-4" />
                  {product.originRegion}
                </span>
              )}
              <span>{vendor.displayName}</span>
            </div>

            {product.description && (
              <p className="mt-5 text-[var(--foreground-soft)] leading-relaxed">
                {product.description}
              </p>
            )}

            {/* Price card */}
            <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-5">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-[var(--foreground)]">
                  {formatPrice(finalPrice)}
                </span>
                {hasAutoDiscount && (
                  <span className="text-base text-[var(--muted)] line-through">
                    {formatPrice(basePrice)}
                  </span>
                )}
                {!hasAutoDiscount && hasCompareAt && (
                  <span className="text-base text-[var(--muted)] line-through">
                    {formatPrice(compareAtPrice)}
                  </span>
                )}
                <span className="text-sm text-[var(--muted)]">/ {product.unit}</span>
              </div>
              {hasAutoDiscount && (
                <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                  {autoDiscountLabel}
                </p>
              )}
              {product.trackStock && (
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {product.stock > 0
                    ? t('vendor.preview.stockAvailable').replace('{count}', String(product.stock))
                    : t('vendor.preview.stockNone')}
                </p>
              )}

              {/* Disabled CTA — looks like the buyer page but can't buy */}
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600/60 px-4 py-2.5 text-sm font-semibold text-white opacity-70 cursor-not-allowed dark:bg-emerald-500/60 dark:text-gray-950"
                >
                  <LockClosedIcon className="h-4 w-4" />
                  {t('vendor.preview.ctaDisabled')}
                </button>
                <p className="text-center text-xs text-[var(--muted)]">
                  {t('vendor.preview.ctaDisabledHint')}
                </p>
              </div>
            </div>

            <ProductPromotions promotions={informationalPromotions} locale={locale} />

            {/* Vendor card */}
            <div className="mt-6 flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
              {vendor.logo ? (
                <Image
                  src={vendor.logo}
                  alt={vendor.logoAlt?.trim() || vendor.displayName}
                  width={48}
                  height={48}
                  className="h-12 w-12 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-2xl dark:bg-emerald-950/40">
                  🌾
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--foreground)]">{vendor.displayName}</p>
                {vendor.location && (
                  <p className="mt-0.5 text-sm text-[var(--muted)]">{vendor.location}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
