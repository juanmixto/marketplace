import type { VendorStatus } from '@/generated/prisma/enums'

// Types + enum lists for the admin producers page. Isolated from
// producers.ts (which imports `db` and is therefore server-only) so the
// client component can import these without Turbopack trying to pull
// pg / fs into the browser bundle.

export const DEFAULT_PAGE_SIZE = 20

export const PRODUCER_STATUS_FILTERS = [
  'ALL',
  'ACTIVE',
  'APPLYING',
  'PENDING_DOCS',
  'SUSPENDED_TEMP',
  'SUSPENDED_PERM',
  'REJECTED',
] as const
export type ProducerStatusFilter = (typeof PRODUCER_STATUS_FILTERS)[number]

export const PRODUCER_SORT_KEYS = [
  'revenueDesc',
  'revenueAsc',
  'recent',
  'lastSeen',
  'name',
  'orders',
] as const
export type ProducerSortKey = (typeof PRODUCER_SORT_KEYS)[number]

export interface ProducerSparkPoint {
  day: string
  revenue: number
}

export interface EnrichedProducer {
  id: string
  slug: string
  displayName: string
  email: string
  status: VendorStatus
  description: string | null
  location: string | null
  logo: string | null
  productsCount: number
  stripeOnboarded: boolean
  avgRating: number | null
  totalReviews: number
  createdAt: string
  revenue: number
  ordersCount: number
  topProduct: { id: string; name: string; unitsSold: number } | null
  lastSeenAt: string | null
  sparkline: number[]
}

export interface ProducersOverviewParams {
  page?: number
  search?: string
  status?: ProducerStatusFilter
  sort?: ProducerSortKey
}

export interface ProducersOverview {
  pageItems: EnrichedProducer[]
  pagination: {
    page: number
    pageSize: number
    totalFiltered: number
    totalPages: number
  }
  params: {
    search: string
    status: ProducerStatusFilter
    sort: ProducerSortKey
  }
  globals: {
    total: number
    active: number
    pendingReview: number
    suspended: number
    gmv: number
    orders: number
  }
  statusCounts: Record<VendorStatus, number>
}
