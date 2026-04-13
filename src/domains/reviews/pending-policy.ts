/**
 * Per-order pending review count. Pure function — no DB dependency — so it can
 * be unit-tested and reused from client/server surfaces that already hold the
 * relevant order + review data.
 */
export function countPendingReviewsInOrder(order: {
  lines: Array<{ productId: string }>
  reviews: Array<{ productId: string }>
}): number {
  const reviewed = new Set(order.reviews.map(r => r.productId))
  const uniqueProducts = new Set(order.lines.map(l => l.productId))
  let pending = 0
  for (const productId of uniqueProducts) {
    if (!reviewed.has(productId)) pending += 1
  }
  return pending
}

/**
 * First product in the order that the buyer has not yet reviewed, in line
 * order. Used by the order-list pending-review badge to deep-link directly
 * to the right form field instead of dumping the buyer at the top of the
 * page. Returns null when nothing is pending. (#204)
 */
export function firstPendingReviewProductId(order: {
  lines: Array<{ productId: string }>
  reviews: Array<{ productId: string }>
}): string | null {
  const reviewed = new Set(order.reviews.map(r => r.productId))
  const seen = new Set<string>()
  for (const line of order.lines) {
    if (seen.has(line.productId)) continue
    seen.add(line.productId)
    if (!reviewed.has(line.productId)) return line.productId
  }
  return null
}
