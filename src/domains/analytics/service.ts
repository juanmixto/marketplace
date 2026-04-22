import { db } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import type { OrderStatus } from '@/generated/prisma/enums'
import { describeRange, previousPeriod } from './filters'
import { buildInsights } from './insights'
import type {
  AnalyticsFilters,
  AnalyticsPayload,
  CategorySlice,
  DeltaMetric,
  Kpis,
  OrderRow,
  OrderStatusSlice,
  RankedItem,
  SalesPoint,
} from './types'

const EXCLUDED_STATUSES: OrderStatus[] = ['CANCELLED']
const DAY_MS = 24 * 60 * 60 * 1000

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0
  return typeof value === 'number' ? value : Number(value)
}

function delta(current: number, previous: number): DeltaMetric {
  const deltaPct = previous === 0 ? (current === 0 ? 0 : null) : ((current - previous) / previous) * 100
  return { current, previous, deltaPct }
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const value =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!
  return Math.round(value * 10) / 10
}

function daysBetween(start: Date, end: Date): number {
  return Math.round(((end.getTime() - start.getTime()) / DAY_MS) * 10) / 10
}

function buildOrderWhere(filters: AnalyticsFilters, from: Date, to: Date): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    placedAt: { gte: from, lte: to },
  }
  if (filters.orderStatus) {
    where.status = filters.orderStatus
  } else {
    where.status = { notIn: EXCLUDED_STATUSES }
  }
  const lineFilters: Prisma.OrderLineWhereInput = {}
  if (filters.vendorId) lineFilters.vendorId = filters.vendorId
  if (filters.categoryId) lineFilters.product = { categoryId: filters.categoryId }
  if (Object.keys(lineFilters).length > 0) {
    where.lines = { some: lineFilters }
  }
  return where
}

async function aggregateTotals(where: Prisma.OrderWhereInput) {
  const [agg, customersRaw] = await Promise.all([
    db.order.aggregate({
      where,
      _sum: { grandTotal: true, taxAmount: true },
      _count: { _all: true },
    }),
    db.order.findMany({ where, select: { customerId: true } }),
  ])
  const gmv = toNumber(agg._sum.grandTotal)
  const orders = agg._count._all
  const tax = toNumber(agg._sum.taxAmount)
  const uniqueCustomerIds = new Set(customersRaw.map(o => o.customerId))
  return { gmv, orders, tax, uniqueCustomers: uniqueCustomerIds.size }
}

async function computeRepeatRate(where: Prisma.OrderWhereInput): Promise<number> {
  const grouped = await db.order.groupBy({
    by: ['customerId'],
    where,
    _count: { _all: true },
  })
  if (grouped.length === 0) return 0
  const repeat = grouped.filter(g => g._count._all > 1).length
  return (repeat / grouped.length) * 100
}

async function computeBuyerActivation(where: Prisma.OrderWhereInput): Promise<{
  firstOrders: number
  activationLagDays: number
}> {
  const grouped = await db.order.groupBy({
    by: ['customerId'],
    where,
    _min: { placedAt: true },
  })
  if (grouped.length === 0) {
    return { firstOrders: 0, activationLagDays: 0 }
  }

  const firstOrderByCustomer = new Map(
    grouped.flatMap(row => {
      const placedAt = row._min.placedAt
      return placedAt ? [[row.customerId, placedAt] as const] : []
    }),
  )
  const users = await db.user.findMany({
    where: { id: { in: Array.from(firstOrderByCustomer.keys()) } },
    select: { id: true, createdAt: true },
  })
  const userCreatedAt = new Map(users.map(user => [user.id, user.createdAt]))

  const lags: number[] = []
  for (const [customerId, firstPlacedAt] of firstOrderByCustomer.entries()) {
    const createdAt = userCreatedAt.get(customerId)
    if (!createdAt) continue
    lags.push(daysBetween(createdAt, firstPlacedAt))
  }

  return {
    firstOrders: firstOrderByCustomer.size,
    activationLagDays: median(lags),
  }
}

async function computeVendorActivation(filters: AnalyticsFilters): Promise<{
  firstProducts: number
  activationLagDays: number
}> {
  const where: Prisma.ProductWhereInput = {
    createdAt: { gte: filters.from, lte: filters.to },
    ...(filters.vendorId ? { vendorId: filters.vendorId } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
  }
  const grouped = await db.product.groupBy({
    by: ['vendorId'],
    where,
    _min: { createdAt: true },
  })
  if (grouped.length === 0) {
    return { firstProducts: 0, activationLagDays: 0 }
  }

  const firstProductByVendor = new Map(
    grouped.flatMap(row => {
      const createdAt = row._min.createdAt
      return createdAt ? [[row.vendorId, createdAt] as const] : []
    }),
  )
  const vendors = await db.vendor.findMany({
    where: { id: { in: Array.from(firstProductByVendor.keys()) } },
    select: { id: true, user: { select: { createdAt: true } } },
  })
  const vendorCreatedAt = new Map(vendors.map(vendor => [vendor.id, vendor.user.createdAt]))

  const lags: number[] = []
  for (const [vendorId, firstCreatedAt] of firstProductByVendor.entries()) {
    const createdAt = vendorCreatedAt.get(vendorId)
    if (!createdAt) continue
    lags.push(daysBetween(createdAt, firstCreatedAt))
  }

  return {
    firstProducts: firstProductByVendor.size,
    activationLagDays: median(lags),
  }
}

async function computeIncidentRate(orderCount: number, from: Date, to: Date, filters: AnalyticsFilters): Promise<number> {
  if (orderCount === 0) return 0
  const incidentWhere: Prisma.IncidentWhereInput = { createdAt: { gte: from, lte: to } }
  if (filters.vendorId || filters.categoryId) {
    incidentWhere.order = buildOrderWhere(filters, from, to)
  }
  const count = await db.incident.count({ where: incidentWhere })
  return (count / orderCount) * 100
}

async function computeCommission(where: Prisma.OrderWhereInput): Promise<number> {
  const lines = await db.orderLine.findMany({
    where: { order: where },
    select: { quantity: true, unitPrice: true, vendorId: true },
  })
  if (lines.length === 0) return 0
  const vendorIds = Array.from(new Set(lines.map(l => l.vendorId)))
  const vendors = await db.vendor.findMany({
    where: { id: { in: vendorIds } },
    select: { id: true, commissionRate: true },
  })
  const rateMap = new Map(vendors.map(v => [v.id, toNumber(v.commissionRate)]))
  let total = 0
  for (const line of lines) {
    const gross = toNumber(line.unitPrice) * line.quantity
    total += gross * (rateMap.get(line.vendorId) ?? 0)
  }
  return total
}

async function computeKpis(filters: AnalyticsFilters): Promise<Kpis> {
  const prev = previousPeriod(filters)
  const currentWhere = buildOrderWhere(filters, filters.from, filters.to)
  const previousWhere = buildOrderWhere(filters, prev.from, prev.to)

  const [curr, prv] = await Promise.all([aggregateTotals(currentWhere), aggregateTotals(previousWhere)])
  const [currRepeat, prvRepeat] = await Promise.all([
    computeRepeatRate(currentWhere),
    computeRepeatRate(previousWhere),
  ])
  const [currBuyerActivation, prvBuyerActivation] = await Promise.all([
    computeBuyerActivation(currentWhere),
    computeBuyerActivation(previousWhere),
  ])
  const [currVendorActivation, prvVendorActivation] = await Promise.all([
    computeVendorActivation(filters),
    computeVendorActivation({ ...filters, from: prev.from, to: prev.to }),
  ])
  const [currIncident, prvIncident] = await Promise.all([
    computeIncidentRate(curr.orders, filters.from, filters.to, filters),
    computeIncidentRate(prv.orders, prev.from, prev.to, filters),
  ])
  const [currCommission, prvCommission] = await Promise.all([
    computeCommission(currentWhere),
    computeCommission(previousWhere),
  ])

  const currAov = curr.orders > 0 ? curr.gmv / curr.orders : 0
  const prvAov = prv.orders > 0 ? prv.gmv / prv.orders : 0

  return {
    gmv: delta(curr.gmv, prv.gmv),
    orders: delta(curr.orders, prv.orders),
    aov: delta(currAov, prvAov),
    uniqueCustomers: delta(curr.uniqueCustomers, prv.uniqueCustomers),
    repeatRatePct: delta(currRepeat, prvRepeat),
    firstOrders: delta(currBuyerActivation.firstOrders, prvBuyerActivation.firstOrders),
    buyerActivationLagDays: delta(
      currBuyerActivation.activationLagDays,
      prvBuyerActivation.activationLagDays,
    ),
    firstProducts: delta(currVendorActivation.firstProducts, prvVendorActivation.firstProducts),
    vendorActivationLagDays: delta(
      currVendorActivation.activationLagDays,
      prvVendorActivation.activationLagDays,
    ),
    incidentRatePct: delta(currIncident, prvIncident),
    commission: delta(currCommission, prvCommission),
    tax: delta(curr.tax, prv.tax),
  }
}

async function computeSalesEvolution(filters: AnalyticsFilters): Promise<SalesPoint[]> {
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

async function computeTopProducts(filters: AnalyticsFilters): Promise<RankedItem[]> {
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

async function computeTopVendors(filters: AnalyticsFilters): Promise<RankedItem[]> {
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

async function computeCategoryBreakdown(filters: AnalyticsFilters): Promise<CategorySlice[]> {
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

async function computeStatusBreakdown(filters: AnalyticsFilters): Promise<OrderStatusSlice[]> {
  const baseFilters = { ...filters, orderStatus: undefined }
  const where = buildOrderWhere(baseFilters, filters.from, filters.to)
  const grouped = await db.order.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
  })
  return grouped.map(g => ({ status: g.status, count: g._count._all }))
}

async function computeRecentOrders(filters: AnalyticsFilters): Promise<OrderRow[]> {
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

async function getFilterOptions() {
  const [vendors, categories] = await Promise.all([
    db.vendor.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
    }),
    db.category.findMany({
      where: { isActive: true, parentId: null },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ])
  return {
    vendors: vendors.map(v => ({ id: v.id, label: v.displayName })),
    categories: categories.map(c => ({ id: c.id, label: c.name })),
  }
}

export async function getAnalytics(filters: AnalyticsFilters): Promise<AnalyticsPayload> {
  const prev = previousPeriod(filters)
  const [
    kpis,
    salesEvolution,
    topProducts,
    topVendors,
    categoryBreakdown,
    orderStatusBreakdown,
    orders,
    filterOptions,
  ] = await Promise.all([
    computeKpis(filters),
    computeSalesEvolution(filters),
    computeTopProducts(filters),
    computeTopVendors(filters),
    computeCategoryBreakdown(filters),
    computeStatusBreakdown(filters),
    computeRecentOrders(filters),
    getFilterOptions(),
  ])

  const insights = buildInsights({
    kpis,
    topProducts,
    topVendors,
    categoryBreakdown,
    salesEvolution,
  })

  return {
    period: {
      from: filters.from.toISOString(),
      to: filters.to.toISOString(),
      label: describeRange(filters),
    },
    previousPeriod: { from: prev.from.toISOString(), to: prev.to.toISOString() },
    kpis,
    salesEvolution,
    topProducts,
    topVendors,
    categoryBreakdown,
    orderStatusBreakdown,
    orders,
    insights,
    filterOptions,
  }
}
