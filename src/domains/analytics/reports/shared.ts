import { Prisma } from '@/generated/prisma/client'
import type { OrderStatus } from '@/generated/prisma/enums'
import type { AnalyticsFilters } from '../types'

export const EXCLUDED_STATUSES: OrderStatus[] = ['CANCELLED']

export function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0
  return typeof value === 'number' ? value : Number(value)
}

export function delta(current: number, previous: number) {
  const deltaPct = previous === 0 ? (current === 0 ? 0 : null) : ((current - previous) / previous) * 100
  return { current, previous, deltaPct }
}

export function buildOrderWhere(filters: AnalyticsFilters, from: Date, to: Date): Prisma.OrderWhereInput {
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
