import { db } from '@/lib/db'
import type { AnalyticsFilters, CategorySlice, OrderStatusSlice } from '../types'
import { buildOrderWhere, toNumber } from './shared'

export async function getCategoryBreakdown(filters: AnalyticsFilters): Promise<CategorySlice[]> {
  const where = buildOrderWhere(filters, filters.from, filters.to)
  const lines = await db.orderLine.findMany({
    where: {
      order: where,
      ...(filters.vendorId ? { vendorId: filters.vendorId } : {}),
      ...(filters.categoryId ? { product: { categoryId: filters.categoryId } } : {}),
    },
    select: {
      quantity: true,
      unitPrice: true,
      product: { select: { category: { select: { id: true, name: true } } } },
    },
  })
  const revenueMap = new Map<string, { id: string; name: string; revenue: number }>()
  for (const l of lines) {
    const cat = l.product.category
    const key = cat?.id ?? '__none__'
    const label = cat?.name ?? 'Sin categoría'
    const existing = revenueMap.get(key) ?? { id: key, name: label, revenue: 0 }
    existing.revenue += toNumber(l.unitPrice) * l.quantity
    revenueMap.set(key, existing)
  }
  const total = Array.from(revenueMap.values()).reduce((s, c) => s + c.revenue, 0)
  return Array.from(revenueMap.values())
    .map(c => ({ ...c, sharePct: total > 0 ? (c.revenue / total) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue)
}

export async function getOrderStatusBreakdown(filters: AnalyticsFilters): Promise<OrderStatusSlice[]> {
  const baseFilters = { ...filters, orderStatus: undefined }
  const where = buildOrderWhere(baseFilters, filters.from, filters.to)
  const grouped = await db.order.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
  })
  return grouped.map(g => ({ status: g.status, count: g._count._all }))
}
