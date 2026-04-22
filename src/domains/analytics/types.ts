import type { OrderStatus } from '@/generated/prisma/enums'

export type PresetRange = 'today' | '7d' | '30d' | 'mtd' | 'custom'

export interface AnalyticsFilters {
  preset: PresetRange
  from: Date
  to: Date
  vendorId?: string
  categoryId?: string
  orderStatus?: OrderStatus
}

export interface SerializableFilters {
  preset: PresetRange
  from: string
  to: string
  vendorId?: string
  categoryId?: string
  orderStatus?: OrderStatus
}

export interface DeltaMetric {
  current: number
  previous: number
  deltaPct: number | null
}

export interface Kpis {
  gmv: DeltaMetric
  orders: DeltaMetric
  aov: DeltaMetric
  uniqueCustomers: DeltaMetric
  repeatRatePct: DeltaMetric
  firstOrders: DeltaMetric
  buyerActivationLagDays: DeltaMetric
  firstProducts: DeltaMetric
  vendorActivationLagDays: DeltaMetric
  incidentRatePct: DeltaMetric
  commission: DeltaMetric
  tax: DeltaMetric
}

export interface SalesPoint {
  date: string
  gmv: number
  orders: number
}

export interface RankedItem {
  id: string
  name: string
  revenue: number
  count: number
  secondary?: string
}

export interface CategorySlice {
  id: string
  name: string
  revenue: number
  sharePct: number
}

export interface OrderStatusSlice {
  status: OrderStatus
  count: number
}

export interface OrderRow {
  id: string
  orderNumber: string
  customerName: string
  vendorName: string
  grandTotal: number
  status: OrderStatus
  placedAt: string
}

export interface Insight {
  id: string
  tone: 'positive' | 'warning' | 'neutral'
  title: string
  body: string
}

export interface FilterOptionSet {
  vendors: Array<{ id: string; label: string }>
  categories: Array<{ id: string; label: string }>
}

export interface AnalyticsPayload {
  period: { from: string; to: string; label: string }
  previousPeriod: { from: string; to: string }
  kpis: Kpis
  salesEvolution: SalesPoint[]
  topProducts: RankedItem[]
  topVendors: RankedItem[]
  categoryBreakdown: CategorySlice[]
  orderStatusBreakdown: OrderStatusSlice[]
  orders: OrderRow[]
  insights: Insight[]
  filterOptions: FilterOptionSet
}
