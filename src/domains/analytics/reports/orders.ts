import { db } from '@/lib/db'
import type { AnalyticsFilters, OrderRow } from '../types'
import { buildOrderWhere, toNumber } from './shared'

export async function getRecentOrders(filters: AnalyticsFilters): Promise<OrderRow[]> {
  const where = buildOrderWhere(filters, filters.from, filters.to)
  const rows = await db.order.findMany({
    where,
    orderBy: { placedAt: 'desc' },
    take: 200,
    select: {
      id: true,
      orderNumber: true,
      grandTotal: true,
      status: true,
      placedAt: true,
      customer: { select: { firstName: true, lastName: true } },
      lines: { take: 1, select: { vendorId: true } },
    },
  })
  const vendorIds = Array.from(new Set(rows.flatMap(r => r.lines.map(l => l.vendorId))))
  const vendors = vendorIds.length
    ? await db.vendor.findMany({
        where: { id: { in: vendorIds } },
        select: { id: true, displayName: true },
      })
    : []
  const vendorNameMap = new Map(vendors.map(v => [v.id, v.displayName]))
  return rows.map(r => ({
    id: r.id,
    orderNumber: r.orderNumber,
    customerName: `${r.customer.firstName} ${r.customer.lastName}`.trim(),
    vendorName: r.lines[0]?.vendorId ? (vendorNameMap.get(r.lines[0].vendorId) ?? '—') : '—',
    grandTotal: toNumber(r.grandTotal),
    status: r.status,
    placedAt: r.placedAt.toISOString(),
  }))
}
