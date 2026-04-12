export interface ProductVariantOption {
  id: string
  name: string
  priceModifier: number
  stock: number
  isActive: boolean
}

export interface PurchasableProduct {
  basePrice: number
  compareAtPrice?: number | null
  stock: number
  trackStock: boolean
  variants: ProductVariantOption[]
}

export function getActiveVariants(product: PurchasableProduct) {
  return product.variants.filter(variant => variant.isActive)
}

export function productRequiresVariantSelection(product: PurchasableProduct) {
  return getActiveVariants(product).length > 0
}

export function getSelectedVariant(
  product: PurchasableProduct,
  variantId?: string | null
) {
  if (!variantId) return null

  return getActiveVariants(product).find(variant => variant.id === variantId) ?? null
}

export function getDefaultVariant(product: PurchasableProduct) {
  const activeVariants = getActiveVariants(product)

  return activeVariants.find(variant => !product.trackStock || variant.stock > 0) ?? activeVariants[0] ?? null
}

/**
 * Stripe's minimum charge amount is 0.50 EUR. A variant whose base price
 * plus priceModifier lands below this threshold cannot actually be
 * charged — checkout will explode late and confusingly.
 */
export const MINIMUM_CHARGEABLE_PRICE_EUR = 0.5

export function getVariantAdjustedPrice(
  basePrice: number,
  variant?: Pick<ProductVariantOption, 'priceModifier'> | null
): number {
  return Math.round((basePrice + Number(variant?.priceModifier ?? 0)) * 100) / 100
}

export function isVariantPriceChargeable(price: number): boolean {
  return Number.isFinite(price) && price >= MINIMUM_CHARGEABLE_PRICE_EUR
}

/**
 * Throws when the variant-adjusted price is below the minimum chargeable
 * amount. Call this from vendor-facing product validation and from the
 * checkout action just before creating the order — display code (product
 * card, product detail) should keep using getVariantAdjustedPrice directly
 * so the UI can still render an informative "no disponible" state instead
 * of a 500 error.
 */
export function assertVariantPriceChargeable(
  price: number,
  productName?: string
): void {
  if (!isVariantPriceChargeable(price)) {
    const label = productName ? `"${productName}" ` : ''
    throw new Error(
      `El precio de ${label}(${price.toFixed(2)} EUR) es inferior al mínimo cobrable (${MINIMUM_CHARGEABLE_PRICE_EUR.toFixed(2)} EUR)`
    )
  }
}

export function getVariantAdjustedCompareAtPrice(
  compareAtPrice: number | null | undefined,
  variant?: Pick<ProductVariantOption, 'priceModifier'> | null
) {
  if (compareAtPrice == null) return null
  return Math.round((compareAtPrice + Number(variant?.priceModifier ?? 0)) * 100) / 100
}

export function getAvailableStockForPurchase(
  product: PurchasableProduct,
  variant?: Pick<ProductVariantOption, 'stock'> | null
) {
  if (!product.trackStock) return null
  if (productRequiresVariantSelection(product)) return variant?.stock ?? 0
  return product.stock
}
