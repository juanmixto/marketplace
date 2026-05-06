import { db } from '@/lib/db'
import type { VendorStatus } from '@/generated/prisma/enums'
import { requireAdmin } from '@/lib/auth-guard'
import {
  DEFAULT_PAGE_SIZE,
  PRODUCER_SORT_KEYS,
  PRODUCER_STATUS_FILTERS,
  type EnrichedProducer,
  type ProducerSortKey,
  type ProducerStatusFilter,
  type ProducersOverview,
  type ProducersOverviewParams,
} from './producers-schema'

// Re-export the schema surface so existing callers (page.tsx, tests) keep
// their single-file import path while the DB-free types live in a sibling
// module the client can safely import.
export {
  DEFAULT_PAGE_SIZE,
  PRODUCER_SORT_KEYS,
  PRODUCER_STATUS_FILTERS,
  type EnrichedProducer,
  type ProducerSortKey,
  type ProducerStatusFilter,
  type ProducersOverview,
  type ProducersOverviewParams,
}

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

export function normalizeProducersOverviewParams(
  raw: ProducersOverviewParams | undefined
): Required<Omit<ProducersOverviewParams, 'page'>> & { page: number; pageSize: number } {
  const pageSize = DEFAULT_PAGE_SIZE
  const page = Math.max(1, Math.floor(raw?.page ?? 1))
  const search = (raw?.search ?? '').trim()
  const status: ProducerStatusFilter = PRODUCER_STATUS_FILTERS.includes(
    raw?.status as ProducerStatusFilter
  )
    ? (raw!.status as ProducerStatusFilter)
    : 'ALL'
  const sort: ProducerSortKey = PRODUCER_SORT_KEYS.includes(raw?.sort as ProducerSortKey)
    ? (raw!.sort as ProducerSortKey)
    : 'revenueDesc'
  return { page, pageSize, search, status, sort }
}

export async function getProducersOverview(
  rawParams: ProducersOverviewParams = {}
): Promise<ProducersOverview> {
  await requireAdmin()
  const params = normalizeProducersOverviewParams(rawParams)

  const [vendors, statusGroups, revenueRows, topProductRows, lastSeenRows, sparkRows] = await Promise.all([
    db.vendor.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        // #1351 — `user.email` is loaded server-side ONLY because the
        // search filter below matches against it (admins legitimately
        // search a producer by email). It is then dropped from
        // `EnrichedProducer` before the mapper hands the page payload
        // to the client, so the email never crosses the wire.
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

  const allEnriched: EnrichedProducer[] = vendors.map(v => {
    const rev = revenueByVendor.get(v.id)
    return {
      id: v.id,
      slug: v.slug,
      displayName: v.displayName,
      // #1351 — email intentionally omitted from the list shape.
      // EnrichedProducer.email is now optional; the detail page is
      // the place to surface it.
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

  // Apply filter → sort → paginate server-side so the client only ever
  // deserialises the visible page (~20 rows) instead of the whole table.
  const searchLower = params.search.toLowerCase()
  // #1351 — email matching stays server-side: build a Set of vendor
  // IDs whose email matches, then filter `allEnriched` by id. Email
  // never lands on the EnrichedProducer payload that crosses the wire.
  const emailMatchingIds = new Set<string>()
  if (searchLower) {
    for (const v of vendors) {
      if (v.user.email?.toLowerCase().includes(searchLower)) {
        emailMatchingIds.add(v.id)
      }
    }
  }
  const filtered = allEnriched.filter(p => {
    if (params.status !== 'ALL' && p.status !== params.status) return false
    if (!searchLower) return true
    return (
      p.displayName.toLowerCase().includes(searchLower) ||
      emailMatchingIds.has(p.id) ||
      (p.location?.toLowerCase().includes(searchLower) ?? false)
    )
  })

  const sorted = [...filtered]
  switch (params.sort) {
    case 'revenueDesc':
      sorted.sort((a, b) => b.revenue - a.revenue)
      break
    case 'revenueAsc':
      sorted.sort((a, b) => a.revenue - b.revenue)
      break
    case 'recent':
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      break
    case 'lastSeen':
      sorted.sort((a, b) => (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''))
      break
    case 'name':
      sorted.sort((a, b) => a.displayName.localeCompare(b.displayName))
      break
    case 'orders':
      sorted.sort((a, b) => b.ordersCount - a.ordersCount)
      break
  }

  const totalFiltered = sorted.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / params.pageSize))
  const safePage = Math.min(params.page, totalPages)
  const pageStart = (safePage - 1) * params.pageSize
  const pageItems = sorted.slice(pageStart, pageStart + params.pageSize)

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

  const gmv = allEnriched.reduce((acc, p) => acc + p.revenue, 0)
  const orders = allEnriched.reduce((acc, p) => acc + p.ordersCount, 0)

  return {
    pageItems,
    pagination: {
      page: safePage,
      pageSize: params.pageSize,
      totalFiltered,
      totalPages,
    },
    params: {
      search: params.search,
      status: params.status,
      sort: params.sort,
    },
    globals: {
      total: allEnriched.length,
      active: statusCounts.ACTIVE,
      pendingReview: statusCounts.APPLYING + statusCounts.PENDING_DOCS,
      suspended: statusCounts.SUSPENDED_TEMP + statusCounts.SUSPENDED_PERM,
      gmv,
      orders,
    },
    statusCounts,
  }
}
