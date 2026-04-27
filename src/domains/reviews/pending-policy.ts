/**
 * Per-order pending review count. Pure function — no DB dependency — so it can
 * be unit-tested and reused from client/server surfaces that already hold the
 * relevant order + review data.
 *
 * `alreadyReviewedAcrossAllOrders` is the set of productIds the customer has
 * already reviewed in *any* prior order. We treat those as not-pending so we
 * stop nagging buyers who said their piece on a previous purchase of the same
 * product (the data model still allows a per-order review, but the UX should
 * not push for it). When the set is omitted the function behaves the way it
 * always did, which keeps unit tests + non-DB callers compatible.
 */
export function countPendingReviewsInOrder(
  order: {
    lines: Array<{ productId: string }>
    reviews: Array<{ productId: string }>
  },
  alreadyReviewedAcrossAllOrders?: ReadonlySet<string>,
): number {
  const reviewedInThisOrder = new Set(order.reviews.map(r => r.productId))
  const uniqueProducts = new Set(order.lines.map(l => l.productId))
  let pending = 0
  for (const productId of uniqueProducts) {
    if (reviewedInThisOrder.has(productId)) continue
    if (alreadyReviewedAcrossAllOrders?.has(productId)) continue
    pending += 1
  }
  return pending
}

/**
 * First product in the order that the buyer has not yet reviewed, in line
 * order. Used by the order-list pending-review badge to deep-link directly
 * to the right form field instead of dumping the buyer at the top of the
 * page. Returns null when nothing is pending. (#204)
 *
 * Honours the same `alreadyReviewedAcrossAllOrders` skip-set as the count fn
 * so the deep-link target matches what the count says is pending.
 */
export function firstPendingReviewProductId(
  order: {
    lines: Array<{ productId: string }>
    reviews: Array<{ productId: string }>
  },
  alreadyReviewedAcrossAllOrders?: ReadonlySet<string>,
): string | null {
  const reviewedInThisOrder = new Set(order.reviews.map(r => r.productId))
  const seen = new Set<string>()
  for (const line of order.lines) {
    if (seen.has(line.productId)) continue
    seen.add(line.productId)
    if (reviewedInThisOrder.has(line.productId)) continue
    if (alreadyReviewedAcrossAllOrders?.has(line.productId)) continue
    return line.productId
  }
  return null
}

/**
 * Same idea but returns every productId in the order that is still pending.
 * Drives the new review wizard, which walks pending products one by one.
 */
export function pendingReviewProductIds(
  order: {
    lines: Array<{ productId: string }>
    reviews: Array<{ productId: string }>
  },
  alreadyReviewedAcrossAllOrders?: ReadonlySet<string>,
): string[] {
  const reviewedInThisOrder = new Set(order.reviews.map(r => r.productId))
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of order.lines) {
    if (seen.has(line.productId)) continue
    seen.add(line.productId)
    if (reviewedInThisOrder.has(line.productId)) continue
    if (alreadyReviewedAcrossAllOrders?.has(line.productId)) continue
    out.push(line.productId)
  }
  return out
}
