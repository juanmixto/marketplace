import { db } from '@/lib/db'

/**
 * Phase 5 of the promotions & subscriptions RFC: admin read-only
 * overview for promotions across every vendor. Shows KPIs + a flat list
 * of the most recently created promos with their vendor, scope, state
 * and redemption counts. Deliberately read-only: admin can NOT create,
 * edit or archive promotions through this surface — that stays on the
 * vendor portal.
 */

export interface PromotionRow {
  id: string
  name: string
  code: string | null
  kind: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING'
  scope: 'PRODUCT' | 'VENDOR' | 'CATEGORY'
  value: number
  startsAt: Date
  endsAt: Date
  archivedAt: Date | null
  redemptionCount: number
  maxRedemptions: number | null
  vendor: {
    id: string
    slug: string
    displayName: string
  }
}

export interface PromotionsOverview {
  kpis: {
    totalActive: number
    totalArchived: number
    totalRedemptions: number
    vendorsRunningPromos: number
  }
  promotions: PromotionRow[]
}

export async function getPromotionsOverview(): Promise<PromotionsOverview> {
  const now = new Date()

  const [active, archived, redemptionsAgg, vendorsRunning, rows] = await Promise.all([
    db.promotion.count({
      where: {
        archivedAt: null,
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
    }),
    db.promotion.count({ where: { archivedAt: { not: null } } }),
    db.promotion.aggregate({
      _sum: { redemptionCount: true },
    }),
    db.promotion.findMany({
      where: { archivedAt: null },
      select: { vendorId: true },
      distinct: ['vendorId'],
    }),
    db.promotion.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        vendor: { select: { id: true, slug: true, displayName: true } },
      },
    }),
  ])

  const promotions: PromotionRow[] = rows.map(row => ({
    id: row.id,
    name: row.name,
    code: row.code,
    kind: row.kind,
    scope: row.scope,
    value: Number(row.value),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    archivedAt: row.archivedAt,
    redemptionCount: row.redemptionCount,
    maxRedemptions: row.maxRedemptions,
    vendor: row.vendor,
  }))

  return {
    kpis: {
      totalActive: active,
      totalArchived: archived,
      totalRedemptions: redemptionsAgg._sum.redemptionCount ?? 0,
      vendorsRunningPromos: vendorsRunning.length,
    },
    promotions,
  }
}
