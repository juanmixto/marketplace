'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale } from '@/i18n'
import { AddToCartButton } from '@/components/catalog/AddToCartButton'
import {
  getAvailableStockForPurchase,
  getDefaultVariant,
  getSelectedVariant,
  getVariantAdjustedCompareAtPrice,
  getVariantAdjustedPrice,
  productRequiresVariantSelection,
  type ProductVariantOption,
} from '@/domains/catalog/variants'
import { formatPrice } from '@/lib/utils'
import { createAnalyticsItem, trackAnalyticsEvent } from '@/lib/analytics'
import { getCatalogCopy, translateProductLabel, translateProductUnit } from '@/i18n/catalog-copy'
import { MinusIcon, PlusIcon } from '@heroicons/react/24/outline'

interface AutoDiscount {
  kind: 'PERCENTAGE' | 'FIXED_AMOUNT'
  value: number
  endsAt: string
}

interface Props {
  productId: string
  productName: string
  slug: string
  image?: string
  unit: string
  vendorId: string
  vendorName: string
  basePrice: number
  compareAtPrice?: number | null
  taxRate: number
  trackStock: boolean
  stock: number
  variants: ProductVariantOption[]
  autoDiscount?: AutoDiscount | null
  /**
   * Server-computed shipping estimate for a peninsular default postal
   * code, used to surface "Llega en 3–5 días — envío X €" above the
   * Add-to-cart CTA. Audit #917 (docs/audits/2026-04-27-launch-alignment.md
   * H5). When `null` (DB read failed) the band degrades to the ETA-only
   * line; never blocks the CTA.
   */
  estimatedShippingCost?: number | null
}

export function ProductPurchasePanel({
  productId,
  productName,
  slug,
  image,
  unit,
  vendorId,
  vendorName,
  basePrice,
  compareAtPrice,
  taxRate,
  trackStock,
  stock,
  variants,
  autoDiscount,
  estimatedShippingCost,
}: Props) {
  const { locale } = useLocale()
  const copy = getCatalogCopy(locale)
  const [quantity, setQuantity] = useState(1)
  const inlineCtaRef = useRef<HTMLDivElement>(null)
  const [showStickyCta, setShowStickyCta] = useState(false)

  const product = {
    basePrice,
    compareAtPrice,
    stock,
    trackStock,
    variants,
  }

  const defaultVariant = getDefaultVariant(product)
  const [selectedVariantId, setSelectedVariantId] = useState<string>(defaultVariant?.id ?? '')
  const requiresVariantSelection = productRequiresVariantSelection(product)
  const selectedVariant = getSelectedVariant(product, selectedVariantId)
  const listPrice = getVariantAdjustedPrice(basePrice, selectedVariant)
  const displayCompareAt = getVariantAdjustedCompareAtPrice(compareAtPrice, selectedVariant)
  const autoDiscountAmount = autoDiscount
    ? autoDiscount.kind === 'PERCENTAGE'
      ? Math.min(listPrice, (listPrice * autoDiscount.value) / 100)
      : Math.min(listPrice, autoDiscount.value)
    : 0
  const finalPrice = Math.max(0, listPrice - autoDiscountAmount)
  // `displayPrice` is what we send to the cart and analytics — it MUST
  // stay at the list price. The checkout engine re-evaluates promos
  // and applies the discount as a separate line, so handing it the
  // already-discounted price would double-discount the order.
  const displayPrice = listPrice
  const hasAutoDiscount = autoDiscountAmount > 0
  const hasDiscount = displayCompareAt !== null && displayCompareAt > listPrice
  const savingsPct = hasAutoDiscount ? Math.round((autoDiscountAmount / listPrice) * 100) : 0
  const autoDiscountValidUntil = autoDiscount
    ? new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-ES', { dateStyle: 'medium' }).format(new Date(autoDiscount.endsAt))
    : null
  const availableStock = getAvailableStockForPurchase(product, selectedVariant)
  const localizedUnit = translateProductUnit(unit, locale)

  const canAddToCart = !requiresVariantSelection || selectedVariant !== null
  const isOutOfStock = trackStock && availableStock === 0
  const maxQuantity = trackStock ? Math.max(1, Math.min(availableStock || 1, 99)) : 99
  const quantityPresets = [1, 3, 6].filter(preset => preset <= maxQuantity)

  function updateQuantity(nextQuantity: number) {
    setQuantity(Math.max(1, Math.min(maxQuantity, Math.floor(nextQuantity))))
  }

  useEffect(() => {
    setQuantity(currentQuantity => Math.min(currentQuantity, maxQuantity))
  }, [maxQuantity])

  useEffect(() => {
    if (!requiresVariantSelection) {
      if (selectedVariantId) setSelectedVariantId('')
      return
    }

    if (!selectedVariant && defaultVariant && selectedVariantId !== defaultVariant.id) {
      setSelectedVariantId(defaultVariant.id)
    }
  }, [defaultVariant, requiresVariantSelection, selectedVariant, selectedVariantId])

  useEffect(() => {
    const target = inlineCtaRef.current
    if (!target || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0]
        if (!entry) return
        // Show the sticky CTA only once the inline button has scrolled out of
        // view — avoids a duplicate action stacked on top of the canonical one.
        setShowStickyCta(!entry.isIntersecting)
      },
      { rootMargin: '0px 0px -20% 0px', threshold: 0 },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    trackAnalyticsEvent('view_item', {
      currency: 'EUR',
      value: displayPrice,
      items: [
        createAnalyticsItem({
          id: productId,
          name: productName,
          price: displayPrice,
          variant: selectedVariant?.name,
          brand: vendorName,
        }),
      ],
    })
  }, [displayPrice, productId, productName, selectedVariant?.name, vendorName])

  return (
    <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`text-4xl font-bold ${hasAutoDiscount ? 'text-emerald-700 dark:text-emerald-400' : 'text-[var(--foreground)]'}`}>
          {formatPrice(finalPrice)}
        </span>
        <span className="text-lg text-[var(--muted)]">/ {localizedUnit}</span>
        {hasAutoDiscount && (
          <span className="text-xl text-[var(--muted-light)] line-through">{formatPrice(listPrice)}</span>
        )}
        {!hasAutoDiscount && hasDiscount && (
          <span className="text-xl text-[var(--muted-light)] line-through">{formatPrice(displayCompareAt!)}</span>
        )}
        {hasAutoDiscount && savingsPct > 0 && (
          <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white dark:bg-emerald-500 dark:text-gray-950">
            −{savingsPct}%
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {copy.actions.vatIncluded(Number((taxRate * 100).toFixed(0)))}
      </p>
      {hasAutoDiscount && (
        <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          {locale === 'en'
            ? `You save ${formatPrice(autoDiscountAmount)} — already applied`
            : `Ahorras ${formatPrice(autoDiscountAmount)} — ya aplicado`}
          {autoDiscountValidUntil && (
            <span className="ml-1 text-xs font-normal text-emerald-700/80 dark:text-emerald-400/80">
              · {locale === 'en' ? `until ${autoDiscountValidUntil}` : `hasta ${autoDiscountValidUntil}`}
            </span>
          )}
        </p>
      )}

      {requiresVariantSelection && (
        <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
          <p className="text-sm font-semibold text-[var(--foreground)]">{copy.actions.selectFormat}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {variants.map(variant => {
              const variantPrice = getVariantAdjustedPrice(basePrice, variant)
              const isSelected = selectedVariantId === variant.id
              const variantOutOfStock = trackStock && variant.stock === 0

              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => setSelectedVariantId(variant.id)}
                  className={`rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50 shadow-sm dark:border-emerald-400 dark:bg-emerald-950/40'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:border-emerald-300 hover:bg-[var(--surface-raised)] dark:hover:border-emerald-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-[var(--foreground)]">{translateProductLabel(variant.name, locale)}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {variant.priceModifier === 0
                          ? copy.actions.noSurcharge
                          : copy.actions.overBase(formatPrice(Math.abs(variant.priceModifier)), variant.priceModifier > 0)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">{formatPrice(variantPrice)}</p>
                  </div>
                  {trackStock && (
                    <p className={`mt-2 text-xs font-medium ${variantOutOfStock ? 'text-red-600 dark:text-red-400' : variant.stock <= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {variantOutOfStock
                        ? copy.actions.outOfStock
                        : variant.stock <= 5
                          ? copy.actions.onlyLeft(variant.stock)
                          : copy.actions.inStock(variant.stock)}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
          {!selectedVariant && (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
              {copy.actions.selectVariant}
            </p>
          )}
        </div>
      )}

      {trackStock && (
        <p className={`mt-4 text-sm font-medium ${
          requiresVariantSelection && !selectedVariant
            ? 'text-[var(--muted)]'
            : availableStock === 0
            ? 'text-red-600 dark:text-red-400'
            : availableStock != null && availableStock <= 5
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-emerald-600 dark:text-emerald-400'
        }`}>
          {requiresVariantSelection && !selectedVariant
            ? copy.actions.selectVariantForStock
            : availableStock === 0
            ? copy.actions.outOfStock
            : availableStock != null && availableStock <= 5
              ? copy.actions.onlyLeft(availableStock)
              : availableStock != null
                ? copy.actions.inStock(availableStock)
                : copy.actions.available}
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">{copy.actions.quantity}</p>
            <p className="text-xs text-[var(--muted)]">{copy.actions.quantityHint}</p>
          </div>
          {trackStock && !isOutOfStock && (
            <p className="text-xs font-medium text-[var(--muted)]">
              {copy.actions.maxUnits(availableStock ?? 0)}
            </p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
            <button
              type="button"
              onClick={() => updateQuantity(quantity - 1)}
              disabled={quantity <= 1}
              className="p-2 text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={copy.actions.decreaseQuantity}
            >
              <MinusIcon className="h-4 w-4" />
            </button>
            <input
              id={`quantity-${productId}`}
              type="number"
              min={1}
              max={maxQuantity}
              inputMode="numeric"
              value={quantity}
              onChange={event => {
                const nextQuantity = Number.parseInt(event.target.value, 10)
                if (Number.isNaN(nextQuantity)) return
                updateQuantity(nextQuantity)
              }}
              className="w-16 border-x border-[var(--border)] bg-transparent px-2 py-2 text-center text-sm font-semibold text-[var(--foreground)] focus:outline-none"
              aria-label={copy.actions.quantityOf(productName)}
            />
            <button
              type="button"
              onClick={() => updateQuantity(quantity + 1)}
              disabled={quantity >= maxQuantity}
              className="p-2 text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={copy.actions.increaseQuantity}
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {quantityPresets.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => updateQuantity(preset)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  quantity === preset
                    ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-gray-950'
                    : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-soft)] hover:border-emerald-300 hover:text-emerald-700 dark:hover:border-emerald-700 dark:hover:text-emerald-300'
                }`}
              >
                {preset} {translateProductUnit('uds.', locale)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-800/60 dark:bg-emerald-950/30"
        data-testid="pdp-shipping-band"
      >
        <p className="font-semibold text-emerald-900 dark:text-emerald-100">
          {copy.product.shippingEta}
        </p>
        {typeof estimatedShippingCost === 'number' && (
          <p className="mt-0.5 text-emerald-800/90 dark:text-emerald-200/90">
            {copy.product.shippingCostFormat(formatPrice(estimatedShippingCost))}
          </p>
        )}
        <p className="mt-1 text-xs text-emerald-800/70 dark:text-emerald-200/70">
          {copy.product.shippingDisclaimer}
        </p>
      </div>

      <div ref={inlineCtaRef} className="mt-6">
        <AddToCartButton
          productId={productId}
          variantId={selectedVariant?.id}
          variantName={selectedVariant?.name}
          disabled={!canAddToCart || isOutOfStock}
          quantity={quantity}
          productName={productName}
          price={displayPrice}
          slug={slug}
          image={image}
          unit={localizedUnit}
          vendorId={vendorId}
          vendorName={vendorName}
        />
      </div>

      {/* Mobile sticky CTA — revealed once the inline add-to-cart scrolls out
          of view. Keeps the primary action always a thumb away on phones.
          Hidden from desktop so the inline panel stays canonical there. */}
      <MobileStickyCta
        visible={showStickyCta}
        price={finalPrice}
        unit={localizedUnit}
      >
        <AddToCartButton
          productId={productId}
          variantId={selectedVariant?.id}
          variantName={selectedVariant?.name}
          disabled={!canAddToCart || isOutOfStock}
          quantity={quantity}
          productName={productName}
          price={displayPrice}
          slug={slug}
          image={image}
          unit={localizedUnit}
          vendorId={vendorId}
          vendorName={vendorName}
          size="md"
          className="min-w-[9rem]"
        />
      </MobileStickyCta>
    </div>
  )
}

interface MobileStickyCtaProps {
  visible: boolean
  price: number
  unit: string
  children: React.ReactNode
}

function MobileStickyCta({ visible, price, unit, children }: MobileStickyCtaProps) {
  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)]/95 px-4 pt-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] backdrop-blur transition-transform duration-200 md:hidden ${
        visible ? 'translate-y-0' : 'translate-y-full pointer-events-none'
      }`}
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-[var(--foreground)]">
            {formatPrice(price)}
            <span className="ml-1 text-xs font-normal text-[var(--muted)]">/ {unit}</span>
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}
