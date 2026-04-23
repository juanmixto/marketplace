import type { Prisma } from '@/generated/prisma/client'
import { Prisma as PrismaSql } from '@/generated/prisma/client'
import {
  InsufficientStockError,
  ProductUnavailableError,
  VariantUnavailableError,
} from './errors'

export interface TrackedOrderLineStockInput {
  productId: string
  productName: string
  variantId: string | null
  quantity: number
}

export interface StockLowCandidate {
  productId: string
  vendorId: string
  productName: string
  remainingStock: number
}

/**
 * Reserve tracked stock for a single order line inside the order transaction.
 *
 * This keeps the exact locking and decrement semantics that previously lived
 * inline in `createOrder`:
 * - variant stock uses `SELECT ... FOR UPDATE` on `ProductVariant`
 * - product stock uses `SELECT ... FOR UPDATE` on `Product`
 * - the decrement happens only after the locked row confirms enough stock
 * - low-stock alert candidates are emitted only for tracked product rows
 */
export async function reserveTrackedOrderLineStock(
  tx: Prisma.TransactionClient,
  line: TrackedOrderLineStockInput,
  lowStockThreshold: number,
): Promise<StockLowCandidate | null> {
  if (line.variantId) {
    interface VariantRow {
      id: string
      stock: number | null
    }
    const [variant] = await tx.$queryRaw<VariantRow[]>(PrismaSql.sql`
      SELECT id, stock FROM "ProductVariant"
      WHERE id = ${line.variantId}
      FOR UPDATE
    `)

    if (!variant) {
      throw new VariantUnavailableError(line.productName, false)
    }
    if (variant.stock !== null && variant.stock < line.quantity) {
      throw new InsufficientStockError(
        `Stock insuficiente para "${line.productName}" (variante agotada)`
      )
    }

    await tx.productVariant.update({
      where: { id: line.variantId },
      data: { stock: variant.stock !== null ? { decrement: line.quantity } : undefined },
    })

    return null
  }

  interface ProductRow {
    id: string
    stock: number
  }
  const [lockedProduct] = await tx.$queryRaw<ProductRow[]>(PrismaSql.sql`
    SELECT id, stock FROM "Product"
    WHERE id = ${line.productId}
    FOR UPDATE
  `)

  if (!lockedProduct) {
    throw new ProductUnavailableError(line.productName, true)
  }
  if (lockedProduct.stock < line.quantity) {
    throw new InsufficientStockError(`Stock insuficiente para "${line.productName}"`)
  }

  const updated = await tx.product.update({
    where: { id: line.productId },
    data: { stock: { decrement: line.quantity } },
    select: { stock: true, name: true, vendorId: true },
  })

  const crossed =
    lockedProduct.stock > lowStockThreshold &&
    updated.stock <= lowStockThreshold
  if (crossed || updated.stock === 0) {
    return {
      productId: line.productId,
      vendorId: updated.vendorId,
      productName: updated.name,
      remainingStock: updated.stock,
    }
  }

  return null
}
