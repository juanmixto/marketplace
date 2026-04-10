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

export function getVariantAdjustedPrice(
  basePrice: number,
  variant?: Pick<ProductVariantOption, 'priceModifier'> | null
) {
  return Math.round((basePrice + Number(variant?.priceModifier ?? 0)) * 100) / 100
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
