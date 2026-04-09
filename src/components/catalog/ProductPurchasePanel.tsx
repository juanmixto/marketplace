'use client'

import { useState } from 'react'
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

  return (
    <div className="mt-6">
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
        <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
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
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50 shadow-sm dark:bg-emerald-950/40 dark:border-emerald-500'
                      : 'border-[var(--border)] hover:border-emerald-300 hover:bg-[var(--surface-raised)] dark:hover:border-emerald-700'
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
              Selecciona una variante antes de anadir el producto al carrito.
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

      <div className="mt-8">
        <AddToCartButton
          productId={productId}
          variantId={selectedVariant?.id}
          variantName={selectedVariant?.name}
          disabled={!canAddToCart || isOutOfStock}
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
