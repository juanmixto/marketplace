import { db } from '@/lib/db'
import { countPendingReviewsInOrder } from './pending-policy'

export { countPendingReviewsInOrder }

export interface PendingReviewLine {
  orderId: string
  productId: string
  productName: string
  vendorId: string
  vendorSlug: string
}

export interface PendingReviewsSummary {
  total: number
  orderCount: number
  firstPendingOrderId: string | null
  items: PendingReviewLine[]
}

async function loadDeliveredOrdersWithReviewState(customerId: string, vendorId?: string) {
  const orders = await db.order.findMany({
    where: vendorId
      ? {
          customerId,
          status: 'DELIVERED',
          lines: { some: { vendorId } },
        }
      : { customerId, status: 'DELIVERED' },
    orderBy: { placedAt: 'desc' },
    select: {
      id: true,
      lines: {
        where: vendorId ? { vendorId } : undefined,
        select: {
          productId: true,
          vendorId: true,
          product: {
            select: {
              name: true,
              vendor: { select: { slug: true } },
            },
          },
        },
      },
      reviews: {
        select: { productId: true },
      },
    },
  })
  return orders
}

/**
 * Counts how many delivered order lines the customer has that still lack a review.
 * One product purchased in N separate delivered orders counts as N pending items,
 * matching the `(orderId, productId)` unique constraint on `Review`.
 */
export async function getPendingReviewsCount(
  customerId: string,
  opts?: { vendorId?: string }
): Promise<number> {
  const orders = await loadDeliveredOrdersWithReviewState(customerId, opts?.vendorId)
  return orders.reduce((acc, order) => {
    const reviewed = new Set(order.reviews.map(r => r.productId))
    const uniqueLineProducts = new Set(order.lines.map(l => l.productId))
    let pending = 0
    for (const productId of uniqueLineProducts) {
      if (!reviewed.has(productId)) pending += 1
    }
    return acc + pending
  }, 0)
}

/**
 * Returns a full breakdown of pending-review items for a customer, optionally
 * scoped to a single vendor. The first pending order ID is handy to deep-link
 * the user into the corresponding order detail.
 */
export async function getPendingReviewsSummary(
  customerId: string,
  opts?: { vendorId?: string }
): Promise<PendingReviewsSummary> {
  const orders = await loadDeliveredOrdersWithReviewState(customerId, opts?.vendorId)

  const items: PendingReviewLine[] = []
  const pendingOrderIds = new Set<string>()

  for (const order of orders) {
    const reviewed = new Set(order.reviews.map(r => r.productId))
    const seenProducts = new Set<string>()
    for (const line of order.lines) {
      if (seenProducts.has(line.productId)) continue
      seenProducts.add(line.productId)
      if (reviewed.has(line.productId)) continue
      items.push({
        orderId: order.id,
        productId: line.productId,
        productName: line.product.name,
        vendorId: line.vendorId,
        vendorSlug: line.product.vendor.slug,
      })
      pendingOrderIds.add(order.id)
    }
  }

  return {
    total: items.length,
    orderCount: pendingOrderIds.size,
    firstPendingOrderId: items[0]?.orderId ?? null,
    items,
  }
}

/**
 * Compact variant for the vendor profile CTA: just the count and the first
 * pending order ID, scoped to a single vendor.
 */
export async function getVendorPendingReviews(
  customerId: string,
  vendorId: string
): Promise<{ total: number; firstPendingOrderId: string | null }> {
  const summary = await getPendingReviewsSummary(customerId, { vendorId })
  return { total: summary.total, firstPendingOrderId: summary.firstPendingOrderId }
}

