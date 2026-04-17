import { db } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'

/**
 * High-level totals + last-30-days snapshot for the admin analytics page.
 * One round-trip via Promise.all; callers should treat the shape as stable
 * since the /api/admin/stats route serializes it directly.
 */
export interface AdminStats {
  totalUsers: number
  totalOrders: number
  totalRevenue: number
  ordersLast30Days: number
  revenueLast30Days: number
  averageOrderValue: number
  newUsersLast30Days: number
}

const EXCLUDED_STATUSES = ['CANCELLED', 'REFUNDED'] as const
const REVENUE_STATUS_FILTER = {
  status: { notIn: [...EXCLUDED_STATUSES] },
}

export async function getAdminStats(): Promise<AdminStats> {
  const since = new Date()
  since.setDate(since.getDate() - 30)

  const [
    totalUsers,
    totalOrders,
    revenueAggregate,
    ordersLast30Days,
    revenueLast30Aggregate,
    aovAggregate,
    newUsersLast30Days,
  ] = await Promise.all([
    db.user.count(),
    db.order.count({ where: REVENUE_STATUS_FILTER }),
    db.order.aggregate({
      where: REVENUE_STATUS_FILTER,
      _sum: { grandTotal: true },
    }),
    db.order.count({
      where: { ...REVENUE_STATUS_FILTER, placedAt: { gte: since } },
    }),
    db.order.aggregate({
      where: { ...REVENUE_STATUS_FILTER, placedAt: { gte: since } },
      _sum: { grandTotal: true },
    }),
    db.order.aggregate({
      where: REVENUE_STATUS_FILTER,
      _avg: { grandTotal: true },
    }),
    db.user.count({ where: { createdAt: { gte: since } } }),
  ])

  return {
    totalUsers,
    totalOrders,
    totalRevenue: Number(revenueAggregate._sum?.grandTotal ?? 0),
    ordersLast30Days,
    revenueLast30Days: Number(revenueLast30Aggregate._sum?.grandTotal ?? 0),
    averageOrderValue: Number(aovAggregate._avg?.grandTotal ?? 0),
    newUsersLast30Days,
  }
}

export interface DailyRevenuePoint {
  date: string // ISO date (YYYY-MM-DD)
  revenue: number
  orders: number
  newUsers: number
}

interface DailyRevenueRow {
  day: Date
  revenue: number | null
  orders: bigint | number
}

interface DailyUsersRow {
  day: Date
  users: bigint | number
}

/**
 * Daily series for the admin analytics charts. Buckets revenue+order count
 * and new-user count by `date_trunc('day', ...)` then merges them into a
 * single sparse-filled timeline so the chart never has gaps.
 *
 * Two queries instead of N+1: one over Order, one over User. Both are
 * indexed on their timestamp columns by default.
 */
export async function getAdminDailyRevenue(days = 30): Promise<DailyRevenuePoint[]> {
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)))
  const since = new Date()
  since.setDate(since.getDate() - safeDays + 1)
  since.setHours(0, 0, 0, 0)

  const [revenueRows, userRows] = await Promise.all([
    db.$queryRaw<DailyRevenueRow[]>(Prisma.sql`
      SELECT
        date_trunc('day', "placedAt")::date AS day,
        COALESCE(SUM("grandTotal"), 0)::float AS revenue,
        COUNT(*)::int AS orders
      FROM "Order"
      WHERE "placedAt" >= ${since}
        AND status NOT IN ('CANCELLED', 'REFUNDED')
      GROUP BY day
      ORDER BY day ASC
    `),
    db.$queryRaw<DailyUsersRow[]>(Prisma.sql`
      SELECT
        date_trunc('day', "createdAt")::date AS day,
        COUNT(*)::int AS users
      FROM "User"
      WHERE "createdAt" >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `),
  ])

  const revenueByDay = new Map<string, { revenue: number; orders: number }>()
  for (const row of revenueRows) {
    const key = toIsoDate(row.day)
    revenueByDay.set(key, {
      revenue: Number(row.revenue ?? 0),
      orders: Number(row.orders ?? 0),
    })
  }

  const usersByDay = new Map<string, number>()
  for (const row of userRows) {
    usersByDay.set(toIsoDate(row.day), Number(row.users ?? 0))
  }

  const series: DailyRevenuePoint[] = []
  const cursor = new Date(since)
  for (let i = 0; i < safeDays; i++) {
    const key = toIsoDate(cursor)
    const rev = revenueByDay.get(key)
    series.push({
      date: key,
      revenue: rev?.revenue ?? 0,
      orders: rev?.orders ?? 0,
      newUsers: usersByDay.get(key) ?? 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  return series
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
