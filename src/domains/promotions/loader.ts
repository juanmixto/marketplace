import { db } from '@/lib/db'
import type { EvaluablePromotion } from '@/domains/promotions/evaluation'

/**
 * Loads every non-archived promotion that could possibly apply to the given
 * vendors at the given time, plus any code-gated promotion that matches the
 * buyer-entered code. The returned rows are mapped to the `EvaluablePromotion`
 * shape so the pure engine can evaluate them without hitting the DB.
 *
 * This intentionally fetches a slightly wider set than strictly necessary
 * (the time window is enforced both in SQL and re-checked in the engine) so
 * the evaluator's unit tests can cover the window logic without mocking the
 * DB.
 */
export async function loadEvaluablePromotions({
  vendorIds,
  code,
  now,
}: {
  vendorIds: string[]
  code?: string | null
  now: Date
}): Promise<EvaluablePromotion[]> {
  if (vendorIds.length === 0) return []

  const normalizedCode = code ? code.trim().toUpperCase() : null

  const rows = await db.promotion.findMany({
    where: {
      vendorId: { in: vendorIds },
      archivedAt: null,
      startsAt: { lte: now },
      endsAt: { gte: now },
      OR: [
        { code: null },
        ...(normalizedCode ? [{ code: normalizedCode }] : []),
      ],
    },
  })

  return rows.map(row => ({
    id: row.id,
    vendorId: row.vendorId,
    kind: row.kind,
    scope: row.scope,
    value: Number(row.value),
    code: row.code,
    productId: row.productId,
    categoryId: row.categoryId,
    minSubtotal: row.minSubtotal !== null ? Number(row.minSubtotal) : null,
    maxRedemptions: row.maxRedemptions,
    redemptionCount: row.redemptionCount,
    perUserLimit: row.perUserLimit,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    archivedAt: row.archivedAt,
  }))
}

/**
 * For each of the provided promotionIds, counts how many times the given
 * buyer has already used it. Used by the evaluator to enforce per-user
 * limits before the order is written.
 */
export async function countBuyerRedemptions(
  buyerId: string,
  promotionIds: string[]
): Promise<Map<string, number>> {
  if (promotionIds.length === 0) return new Map()

  const rows = await db.vendorFulfillment.groupBy({
    by: ['promotionId'],
    where: {
      promotionId: { in: promotionIds },
      order: { customerId: buyerId },
    },
    _count: { promotionId: true },
  })

  const map = new Map<string, number>()
  for (const row of rows) {
    if (row.promotionId) {
      map.set(row.promotionId, row._count.promotionId)
    }
  }
  return map
}
