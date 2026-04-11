'use client'

import { useEffect, useState } from 'react'
import { AddToCartButton } from '@/components/catalog/AddToCartButton'
import {
  getAvailableStockForPurchase,
  getSelectedVariant,
  getVariantAdjustedCompareAtPrice,
  getVariantAdjustedPrice,
  productRequiresVariantSelection,
  type ProductVariantOption,
} from '@/domains/catalog/variants'
import { formatPrice } from '@/lib/utils'
import { createAnalyticsItem, trackAnalyticsEvent } from '@/lib/analytics'
import { MinusIcon, PlusIcon } from '@heroicons/react/24/outline'

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
}: Props) {
  const [selectedVariantId, setSelectedVariantId] = useState<string>('')
  const [quantity, setQuantity] = useState(1)

  const product = {
    basePrice,
    compareAtPrice,
    stock,
    trackStock,
    variants,
  }

  const requiresVariantSelection = productRequiresVariantSelection(product)
  const selectedVariant = getSelectedVariant(product, selectedVariantId)
  const displayPrice = getVariantAdjustedPrice(basePrice, selectedVariant)
  const displayCompareAt = getVariantAdjustedCompareAtPrice(compareAtPrice, selectedVariant)
  const hasDiscount = displayCompareAt !== null && displayCompareAt > displayPrice
  const availableStock = getAvailableStockForPurchase(product, selectedVariant)

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
      <div className="flex items-baseline gap-3">
        <span className="text-4xl font-bold text-[var(--foreground)]">{formatPrice(displayPrice)}</span>
        <span className="text-lg text-[var(--muted)]">/ {unit}</span>
        {hasDiscount && (
          <span className="text-xl text-[var(--muted-light)] line-through">{formatPrice(displayCompareAt!)}</span>
        )}
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        IVA incluido ({(taxRate * 100).toFixed(0)}%)
      </p>

      {requiresVariantSelection && (
        <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
          <p className="text-sm font-semibold text-[var(--foreground)]">Selecciona formato</p>
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
                      <p className="font-medium text-[var(--foreground)]">{variant.name}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {variant.priceModifier === 0
                          ? 'Sin recargo'
                          : `${variant.priceModifier > 0 ? '+' : '-'}${formatPrice(Math.abs(variant.priceModifier))} sobre base`}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">{formatPrice(variantPrice)}</p>
                  </div>
                  {trackStock && (
                    <p className={`mt-2 text-xs font-medium ${variantOutOfStock ? 'text-red-600 dark:text-red-400' : variant.stock <= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {variantOutOfStock
                        ? 'Sin stock'
                        : variant.stock <= 5
                          ? `Quedan ${variant.stock} unidades`
                          : `${variant.stock} en stock`}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
          {!selectedVariant && (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
              Selecciona una variante antes de añadir el producto al carrito.
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
            ? 'Selecciona una variante para ver el stock disponible'
            : availableStock === 0
            ? 'Sin stock'
            : availableStock != null && availableStock <= 5
              ? `Solo quedan ${availableStock} unidades`
              : availableStock != null
                ? `${availableStock} en stock`
                : 'Disponible'}
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">Cantidad</p>
            <p className="text-xs text-[var(--muted)]">Añade varias unidades en un solo toque</p>
          </div>
          {trackStock && !isOutOfStock && (
            <p className="text-xs font-medium text-[var(--muted)]">
              Máx. {availableStock} {availableStock === 1 ? 'unidad' : 'unidades'}
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
              aria-label="Reducir cantidad"
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
              aria-label={`Cantidad de ${productName}`}
            />
            <button
              type="button"
              onClick={() => updateQuantity(quantity + 1)}
              disabled={quantity >= maxQuantity}
              className="p-2 text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Aumentar cantidad"
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
                {preset} uds.
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6">
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
          unit={unit}
          vendorId={vendorId}
          vendorName={vendorName}
        />
      </div>
    </div>
  )
}
