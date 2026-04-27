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

/**
 * Set of productIds the customer has already reviewed in any order. Used by
 * the soft-skip rule: if the customer has already reviewed a product on a
 * previous purchase, the UI does not push them to review it again on
 * subsequent orders, even though the data model would still allow a
 * per-order Review row.
 *
 * Lifted to `src/domains/reviews/pending.ts` so the same source of truth
 * powers the hub banner counter, the order list pending pill, the order
 * detail wizard, and the back-end `canLeaveReview` / `createReview` checks.
 */
export async function getCustomerReviewedProductIds(customerId: string): Promise<Set<string>> {
  const reviews = await db.review.findMany({
    where: { customerId },
    select: { productId: true },
  })
  return new Set(reviews.map(r => r.productId))
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
 *
 * Soft-skip rule: if the customer has already reviewed a product in any prior
 * order, that product is not pending in subsequent orders either. The data
 * model still accepts a per-order Review row, but we don't push the buyer to
 * write the same opinion twice.
 */
export async function getPendingReviewsCount(
  customerId: string,
  opts?: { vendorId?: string }
): Promise<number> {
  const [orders, alreadyReviewed] = await Promise.all([
    loadDeliveredOrdersWithReviewState(customerId, opts?.vendorId),
    getCustomerReviewedProductIds(customerId),
  ])
  return orders.reduce((acc, order) => {
    const reviewedInOrder = new Set(order.reviews.map(r => r.productId))
    const uniqueLineProducts = new Set(order.lines.map(l => l.productId))
    let pending = 0
    for (const productId of uniqueLineProducts) {
      if (reviewedInOrder.has(productId)) continue
      if (alreadyReviewed.has(productId)) continue
      pending += 1
    }
    return acc + pending
  }, 0)
}

/**
 * Returns a full breakdown of pending-review items for a customer, optionally
 * scoped to a single vendor. The first pending order ID is handy to deep-link
 * the user into the corresponding order detail.
 *
 * Honours the same soft-skip rule as getPendingReviewsCount.
 */
export async function getPendingReviewsSummary(
  customerId: string,
  opts?: { vendorId?: string }
): Promise<PendingReviewsSummary> {
  const [orders, alreadyReviewed] = await Promise.all([
    loadDeliveredOrdersWithReviewState(customerId, opts?.vendorId),
    getCustomerReviewedProductIds(customerId),
  ])

  const items: PendingReviewLine[] = []
  const pendingOrderIds = new Set<string>()

  for (const order of orders) {
    const reviewedInOrder = new Set(order.reviews.map(r => r.productId))
    const seenProducts = new Set<string>()
    for (const line of order.lines) {
      if (seenProducts.has(line.productId)) continue
      seenProducts.add(line.productId)
      if (reviewedInOrder.has(line.productId)) continue
      if (alreadyReviewed.has(line.productId)) continue
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
