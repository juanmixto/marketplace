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
