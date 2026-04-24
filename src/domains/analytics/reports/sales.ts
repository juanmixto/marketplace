import { db } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import type { AnalyticsFilters, SalesPoint } from '../types'
import { toNumber } from './shared'

export async function getSalesEvolution(filters: AnalyticsFilters): Promise<SalesPoint[]> {
  const excluded = Prisma.sql`ARRAY['CANCELLED']::"OrderStatus"[]`
  const statusClause = filters.orderStatus
    ? Prisma.sql`o."status" = ${filters.orderStatus}::"OrderStatus"`
    : Prisma.sql`o."status" <> ALL (${excluded})`

  const vendorClause = filters.vendorId
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM "OrderLine" l WHERE l."orderId" = o."id" AND l."vendorId" = ${filters.vendorId})`
    : Prisma.empty
  const categoryClause = filters.categoryId
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "OrderLine" l
        JOIN "Product" p ON p."id" = l."productId"
        WHERE l."orderId" = o."id" AND p."categoryId" = ${filters.categoryId}
      )`
    : Prisma.empty

  const rows = await db.$queryRaw<Array<{ bucket: Date; gmv: Prisma.Decimal; orders: bigint }>>(
    Prisma.sql`
      SELECT
        date_trunc('day', o."placedAt") AS bucket,
        COALESCE(SUM(o."grandTotal"), 0) AS gmv,
        COUNT(*)::bigint AS orders
      FROM "Order" o
      WHERE o."placedAt" BETWEEN ${filters.from} AND ${filters.to}
        AND ${statusClause}
        ${vendorClause}
        ${categoryClause}
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
  )

  const byDate = new Map<string, SalesPoint>()
  for (const row of rows) {
    const key = new Date(row.bucket).toISOString().slice(0, 10)
    byDate.set(key, { date: key, gmv: toNumber(row.gmv), orders: Number(row.orders) })
  }

  const out: SalesPoint[] = []
  const cursor = new Date(filters.from)
  cursor.setHours(0, 0, 0, 0)
  const last = new Date(filters.to)
  last.setHours(0, 0, 0, 0)
  while (cursor.getTime() <= last.getTime()) {
    const key = cursor.toISOString().slice(0, 10)
    out.push(byDate.get(key) ?? { date: key, gmv: 0, orders: 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}
