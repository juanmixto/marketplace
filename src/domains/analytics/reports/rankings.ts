import { db } from '@/lib/db'
import type { AnalyticsFilters, RankedItem } from '../types'
import { buildOrderWhere, toNumber } from './shared'

export async function getTopProducts(filters: AnalyticsFilters): Promise<RankedItem[]> {
  const where = buildOrderWhere(filters, filters.from, filters.to)
  const grouped = await db.orderLine.groupBy({
    by: ['productId'],
    where: {
      order: where,
      ...(filters.vendorId ? { vendorId: filters.vendorId } : {}),
      ...(filters.categoryId ? { product: { categoryId: filters.categoryId } } : {}),
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 10,
  })
  if (grouped.length === 0) return []

  const products = await db.product.findMany({
    where: { id: { in: grouped.map(g => g.productId) } },
    select: { id: true, name: true, vendor: { select: { displayName: true } } },
  })
  const productMap = new Map(products.map(p => [p.id, p]))

  const lineSums = await db.orderLine.groupBy({
    by: ['productId'],
    where: {
      productId: { in: grouped.map(g => g.productId) },
      order: where,
    },
    _sum: { quantity: true },
  })
  const qtyMap = new Map(lineSums.map(l => [l.productId, Number(l._sum.quantity ?? 0)]))

  const lines = await db.orderLine.findMany({
    where: { productId: { in: grouped.map(g => g.productId) }, order: where },
    select: { productId: true, quantity: true, unitPrice: true },
  })
  const revenueMap = new Map<string, number>()
  for (const l of lines) {
    const r = revenueMap.get(l.productId) ?? 0
    revenueMap.set(l.productId, r + toNumber(l.unitPrice) * l.quantity)
  }

  return grouped
    .map(g => {
      const p = productMap.get(g.productId)
      return {
        id: g.productId,
        name: p?.name ?? 'Producto eliminado',
        revenue: revenueMap.get(g.productId) ?? 0,
        count: qtyMap.get(g.productId) ?? 0,
        secondary: p?.vendor.displayName,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
}

export async function getTopVendors(filters: AnalyticsFilters): Promise<RankedItem[]> {
  const where = buildOrderWhere(filters, filters.from, filters.to)
  const lines = await db.orderLine.findMany({
    where: {
      order: where,
      ...(filters.vendorId ? { vendorId: filters.vendorId } : {}),
      ...(filters.categoryId ? { product: { categoryId: filters.categoryId } } : {}),
    },
    select: { vendorId: true, orderId: true, quantity: true, unitPrice: true },
  })
  const revenueMap = new Map<string, number>()
  const orderSet = new Map<string, Set<string>>()
  for (const l of lines) {
    revenueMap.set(l.vendorId, (revenueMap.get(l.vendorId) ?? 0) + toNumber(l.unitPrice) * l.quantity)
    const set = orderSet.get(l.vendorId) ?? new Set<string>()
    set.add(l.orderId)
    orderSet.set(l.vendorId, set)
  }
  if (revenueMap.size === 0) return []
  const vendors = await db.vendor.findMany({
    where: { id: { in: Array.from(revenueMap.keys()) } },
    select: { id: true, displayName: true },
  })
  const nameMap = new Map(vendors.map(v => [v.id, v.displayName]))
  return Array.from(revenueMap.entries())
    .map(([id, revenue]) => ({
      id,
      name: nameMap.get(id) ?? 'Productor eliminado',
      revenue,
      count: orderSet.get(id)?.size ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
}
