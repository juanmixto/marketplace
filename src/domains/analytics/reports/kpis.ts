import { db } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import type { AnalyticsFilters, Kpis } from '../types'
import { buildOrderWhere, delta, toNumber } from './shared'
import { previousPeriod } from '../filters'

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

export async function getKpis(filters: AnalyticsFilters): Promise<Kpis> {
  const prev = previousPeriod(filters)
  const currentWhere = buildOrderWhere(filters, filters.from, filters.to)
  const previousWhere = buildOrderWhere(filters, prev.from, prev.to)

  const [curr, prv] = await Promise.all([aggregateTotals(currentWhere), aggregateTotals(previousWhere)])
  const [currRepeat, prvRepeat] = await Promise.all([
    computeRepeatRate(currentWhere),
    computeRepeatRate(previousWhere),
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
    incidentRatePct: delta(currIncident, prvIncident),
    commission: delta(currCommission, prvCommission),
    tax: delta(curr.tax, prv.tax),
  }
}
