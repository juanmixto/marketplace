/**
 * Public, non-action types for the vendors domain.
 *
 * `actions.ts` is `'use server'`, which restricts its exports to
 * async functions only — Next.js refuses to compile a `'use server'`
 * file that exports a string constant or a type. This file is the
 * sibling that holds the contract types and tunable constants that
 * page components / tests want to import alongside the actions.
 */

import type { FulfillmentStatus } from '@/generated/prisma/enums'

// DB audit P1.2-B (#963): cursor pagination size for the vendor
// orders dashboard. Tuned for one-page-fits-on-mobile.
export const VENDOR_FULFILLMENT_PAGE_SIZE = 25

export type VendorFulfillmentSort =
  | 'recent'
  | 'oldest'
  | 'amount_desc'
  | 'amount_asc'
  | 'customer'

export interface VendorFulfillmentFilters {
  cursor?: string
  statuses?: FulfillmentStatus[]
  q?: string
  dateFrom?: Date
  dateTo?: Date
  sort?: VendorFulfillmentSort
}

export interface VendorFulfillmentKpis {
  pending: number
  inPrep: number
  ready: number
  shippedRecent: number // SHIPPED|DELIVERED in the last 7 days
  incident: number
  overdue: number // PENDING older than OVERDUE hours
  revenue30d: number
}

// DB audit P1.2-C (#963): cursor pagination size for the vendor
// catalog dashboard. Same shape as the orders pagination above.
export const VENDOR_PRODUCT_PAGE_SIZE = 25

export type VendorProductFilter =
  | 'all'
  | 'active'
  | 'draft'
  | 'pendingReview'
  | 'rejected'
  | 'outOfStock'
  | 'archived'

export interface VendorProductFilters {
  cursor?: string
  filter?: VendorProductFilter
  q?: string
}

export interface VendorProductAlerts {
  lowStockCount: number
  outOfStockCount: number
  expiredCount: number
  totalActiveCatalog: number
}
