/**
 * Stock availability management with single source of truth
 *
 * Resolves the ambiguity between Product.stock and ProductVariant.stock:
 * - If product has active variants → use variant stock
 * - If product has NO active variants → use product stock
 *
 * This ensures all stock checks go through one centralized function,
 * preventing silent bugs from checking the wrong field.
 */

import { db } from '@/lib/db'
import type { Product, ProductVariant } from '@/generated/prisma/client'

export interface StockInfo {
  available: number | null // null = unlimited
  limitTracked: boolean
}

/**
 * Get effective stock for a product or variant
 * @param product Product with variants included
 * @param variantId Optional specific variant to check
 * @returns Effective available quantity or null if unlimited
 */
export function getEffectiveStockForProduct(
  product: Product & { variants?: ProductVariant[] },
  variantId?: string
): StockInfo {
  const hasActiveVariants = (product.variants ?? []).some(v => v.isActive)

  if (!hasActiveVariants) {
    // No variants: use Product.stock
    return {
      available: product.stock,
      limitTracked: product.trackStock,
    }
  }

  // Has variants: find the specific variant or sum all
  if (variantId) {
    const variant = product.variants?.find(v => v.id === variantId)
    if (!variant) {
      return { available: 0, limitTracked: false }
    }
    return {
      available: variant.stock, // null = unlimited
      limitTracked: variant.stock !== null,
    }
  }

  // Return total across all active variants
  const totalStock = product.variants
    ?.filter(v => v.isActive)
    .reduce((sum, v) => sum + (v.stock ?? 0), 0) ?? 0

  return {
    available: totalStock,
    limitTracked: true,
  }
}

/**
 * Get effective stock from database lookup (for consistency)
 * Used when you don't have the full product object loaded
 */
export async function getEffectiveStock(
  productId: string,
  variantId?: string
): Promise<StockInfo> {
  const product = await db.product.findUniqueOrThrow({
    where: { id: productId },
    include: {
      variants: {
        where: {
          isActive: true,
        },
      },
    },
  })

  return getEffectiveStockForProduct(product, variantId)
}

/**
 * Check if a quantity can be purchased
 * Handles unlimited stock (null) and trackStock=false cases
 */
export function canPurchaseQuantity(stock: StockInfo, quantity: number): boolean {
  if (!stock.limitTracked) {
    return true // No limit
  }
  if (stock.available === null) {
    return true // Unlimited
  }
  return stock.available >= quantity
}

/**
 * Get display text for stock status
 * Used in UI components for showing "X in stock" or "Limited availability"
 */
export function getStockDisplayText(stock: StockInfo): string {
  if (!stock.limitTracked) {
    return 'En stock'
  }
  if (stock.available === null) {
    return 'Disponible'
  }
  if (stock.available <= 0) {
    return 'Sin stock'
  }
  if (stock.available <= 5) {
    return `Quedan ${stock.available}`
  }
  return `${stock.available} disponibles`
}
