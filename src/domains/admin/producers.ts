import { db } from '@/lib/db'
import type { VendorStatus } from '@/generated/prisma/enums'

// Order statuses that count as "billed revenue" for a producer.
// REFUNDED/CANCELLED are intentionally excluded.
const BILLED_STATUSES = [
  'PAYMENT_CONFIRMED',
  'PROCESSING',
  'PARTIALLY_SHIPPED',
  'SHIPPED',
  'DELIVERED',
] as const

const SPARKLINE_DAYS = 14

export interface ProducerSparkPoint {
  day: string
  revenue: number
}

export interface EnrichedProducer {
  id: string
  slug: string
  displayName: string
  email: string
  status: VendorStatus
  description: string | null
  location: string | null
  logo: string | null
  productsCount: number
  stripeOnboarded: boolean
  avgRating: number | null
  totalReviews: number
  createdAt: string
  revenue: number
  ordersCount: number
  topProduct: { id: string; name: string; unitsSold: number } | null
  lastSeenAt: string | null
  sparkline: number[]
}

export interface ProducersOverview {
  producers: EnrichedProducer[]
  globals: {
    total: number
    active: number
    pendingReview: number
    suspended: number
    gmv: number
    orders: number
  }
  statusCounts: Record<VendorStatus, number>
}

interface RevenueRow {
  vendorId: string
  revenue: string | number
  ordersCount: bigint | number
}

interface TopProductRow {
  vendorId: string
  productId: string
  productName: string
  unitsSold: bigint | number
}

interface LastSeenRow {
  vendorId: string
  lastSeenAt: Date | null
}

interface SparkRow {
  vendorId: string
  day: Date
  revenue: string | number
}

function toNumber(value: string | number | bigint | null | undefined): number {
  if (value == null) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function getProducersOverview(): Promise<ProducersOverview> {
  const [vendors, statusGroups, revenueRows, topProductRows, lastSeenRows, sparkRows] = await Promise.all([
    db.vendor.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true } },
        _count: { select: { products: true } },
      },
    }),
    db.vendor.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    db.$queryRaw<RevenueRow[]>`
      SELECT ol."vendorId" AS "vendorId",
             COALESCE(SUM(ol."unitPrice" * ol."quantity"), 0)::text AS "revenue",
             COUNT(DISTINCT ol."orderId")::int AS "ordersCount"
      FROM "OrderLine" ol
      JOIN "Order" o ON o."id" = ol."orderId"
      WHERE o."status"::text = ANY (${BILLED_STATUSES as unknown as string[]})
      GROUP BY ol."vendorId"
    `,
    db.$queryRaw<TopProductRow[]>`
      SELECT "vendorId", "productId", "productName", "unitsSold"
      FROM (
        SELECT ol."vendorId" AS "vendorId",
               ol."productId" AS "productId",
               p."name" AS "productName",
               SUM(ol."quantity")::int AS "unitsSold",
               ROW_NUMBER() OVER (
                 PARTITION BY ol."vendorId"
                 ORDER BY SUM(ol."quantity") DESC, p."name" ASC
               ) AS rn
        FROM "OrderLine" ol
        JOIN "Order" o ON o."id" = ol."orderId"
        JOIN "Product" p ON p."id" = ol."productId"
        WHERE o."status"::text = ANY (${BILLED_STATUSES as unknown as string[]})
        GROUP BY ol."vendorId", ol."productId", p."name"
      ) ranked
      WHERE rn = 1
    `,
    db.$queryRaw<LastSeenRow[]>`
      SELECT v."id" AS "vendorId",
             MAX(s."expires") - INTERVAL '30 days' AS "lastSeenAt"
      FROM "Vendor" v
      JOIN "Session" s ON s."userId" = v."userId"
      GROUP BY v."id"
    `,
    db.$queryRaw<SparkRow[]>`
      SELECT ol."vendorId" AS "vendorId",
             DATE_TRUNC('day', o."placedAt") AS "day",
             COALESCE(SUM(ol."unitPrice" * ol."quantity"), 0)::text AS "revenue"
      FROM "OrderLine" ol
      JOIN "Order" o ON o."id" = ol."orderId"
      WHERE o."placedAt" >= NOW() - (${SPARKLINE_DAYS}::int || ' days')::interval
        AND o."status"::text = ANY (${BILLED_STATUSES as unknown as string[]})
      GROUP BY ol."vendorId", DATE_TRUNC('day', o."placedAt")
    `,
  ])

  const revenueByVendor = new Map<string, { revenue: number; orders: number }>()
  for (const row of revenueRows) {
    revenueByVendor.set(row.vendorId, {
      revenue: toNumber(row.revenue),
      orders: toNumber(row.ordersCount),
    })
  }

  const topProductByVendor = new Map<string, EnrichedProducer['topProduct']>()
  for (const row of topProductRows) {
    topProductByVendor.set(row.vendorId, {
      id: row.productId,
      name: row.productName,
      unitsSold: toNumber(row.unitsSold),
    })
  }

  const lastSeenByVendor = new Map<string, string | null>()
  for (const row of lastSeenRows) {
    lastSeenByVendor.set(row.vendorId, row.lastSeenAt ? row.lastSeenAt.toISOString() : null)
  }

  // Build a 14-day index → 0 for each vendor, then fill from sparkRows.
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const dayKeys: string[] = []
  for (let i = SPARKLINE_DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    dayKeys.push(d.toISOString().slice(0, 10))
  }
  const sparklineByVendor = new Map<string, number[]>()
  for (const row of sparkRows) {
    const key = row.day.toISOString().slice(0, 10)
    const idx = dayKeys.indexOf(key)
    if (idx === -1) continue
    let arr = sparklineByVendor.get(row.vendorId)
    if (!arr) {
      arr = new Array(SPARKLINE_DAYS).fill(0)
      sparklineByVendor.set(row.vendorId, arr)
    }
    arr[idx] = toNumber(row.revenue)
  }

  const producers: EnrichedProducer[] = vendors.map(v => {
    const rev = revenueByVendor.get(v.id)
    return {
      id: v.id,
      slug: v.slug,
      displayName: v.displayName,
      email: v.user.email,
      status: v.status,
      description: v.description,
      location: v.location,
      logo: v.logo,
      productsCount: v._count.products,
      stripeOnboarded: v.stripeOnboarded,
      avgRating: v.avgRating ? Number(v.avgRating) : null,
      totalReviews: v.totalReviews,
      createdAt: v.createdAt.toISOString(),
      revenue: rev?.revenue ?? 0,
      ordersCount: rev?.orders ?? 0,
      topProduct: topProductByVendor.get(v.id) ?? null,
      lastSeenAt: lastSeenByVendor.get(v.id) ?? null,
      sparkline: sparklineByVendor.get(v.id) ?? new Array(SPARKLINE_DAYS).fill(0),
    }
  })

  const statusCounts: Record<VendorStatus, number> = {
    APPLYING: 0,
    PENDING_DOCS: 0,
    ACTIVE: 0,
    REJECTED: 0,
    SUSPENDED_TEMP: 0,
    SUSPENDED_PERM: 0,
  }
  for (const g of statusGroups) {
    statusCounts[g.status] = g._count._all
  }

  const gmv = producers.reduce((acc, p) => acc + p.revenue, 0)
  const orders = producers.reduce((acc, p) => acc + p.ordersCount, 0)

  return {
    producers,
    statusCounts,
    globals: {
      total: producers.length,
      active: statusCounts.ACTIVE,
      pendingReview: statusCounts.APPLYING + statusCounts.PENDING_DOCS,
      suspended: statusCounts.SUSPENDED_TEMP + statusCounts.SUSPENDED_PERM,
      gmv,
      orders,
    },
  }
}
