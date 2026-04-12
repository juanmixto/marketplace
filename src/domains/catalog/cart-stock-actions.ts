'use server'

import { db } from '@/lib/db'
import { getAvailableProductWhere } from './availability'
import { getEffectiveStockForProduct } from './stock'

export interface CartStockRequestItem {
  productId: string
  variantId?: string
  quantity: number
}

export type CartStockStatus = 'OK' | 'INSUFFICIENT' | 'UNAVAILABLE'

export interface CartStockResultItem {
  productId: string
  variantId?: string
  available: number | null
  status: CartStockStatus
  productName?: string
}

export async function getCartStockAvailability(
  items: CartStockRequestItem[]
): Promise<CartStockResultItem[]> {
  if (items.length === 0) return []

  const productIds = [...new Set(items.map(i => i.productId))]
  const products = await db.product.findMany({
    where: {
      id: { in: productIds },
      ...getAvailableProductWhere(),
    },
    include: { variants: true },
  })

  return items.map(item => {
    const product = products.find(p => p.id === item.productId)
    if (!product) {
      return {
        productId: item.productId,
        variantId: item.variantId,
        available: 0,
        status: 'UNAVAILABLE' as const,
      }
    }

    if (item.variantId) {
      const variant = product.variants.find(v => v.id === item.variantId && v.isActive)
      if (!variant) {
        return {
          productId: item.productId,
          variantId: item.variantId,
          available: 0,
          status: 'UNAVAILABLE' as const,
          productName: product.name,
        }
      }
    }

    const stockInfo = getEffectiveStockForProduct(product, item.variantId)

    if (!stockInfo.limitTracked || stockInfo.available === null) {
      return {
        productId: item.productId,
        variantId: item.variantId,
        available: null,
        status: 'OK' as const,
        productName: product.name,
      }
    }

    if (stockInfo.available <= 0) {
      return {
        productId: item.productId,
        variantId: item.variantId,
        available: 0,
        status: 'UNAVAILABLE' as const,
        productName: product.name,
      }
    }

    return {
      productId: item.productId,
      variantId: item.variantId,
      available: stockInfo.available,
      status: stockInfo.available >= item.quantity ? 'OK' : 'INSUFFICIENT',
      productName: product.name,
    }
  })
}
