// Re-export the canonical Prisma enum so domain code keeps the same
// import path while the source of truth lives in @/shared/types/shipping.
import { ShippingProviderCode } from '@/shared/types/shipping'
export { ShippingProviderCode }

export interface PostalAddress {
  contactName: string
  companyName?: string
  phone: string
  email?: string
  line1: string
  line2?: string
  city: string
  province: string
  postalCode: string
  countryCode: string
}

export interface ParcelItem {
  description: string
  quantity: number
  weightGrams: number
  unitPriceCents: number
  hsCode?: string
  sku?: string
}

export interface ShipmentDraft {
  idempotencyKey: string
  reference: string
  from: PostalAddress
  to: PostalAddress
  weightGrams: number
  parcelCount: number
  items: ParcelItem[]
  meta?: Record<string, unknown>
}

export type ShipmentStatusInternal =
  | 'DRAFT'
  | 'LABEL_REQUESTED'
  | 'LABEL_CREATED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'EXCEPTION'
  | 'CANCELLED'
  | 'FAILED'

export interface ShipmentRecord {
  providerCode: ShippingProviderCode
  providerRef: string
  status: ShipmentStatusInternal
  carrierName: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  labelUrl: string | null
  labelFormat: 'pdf' | 'zpl' | null
  createdAt: Date
  providerMeta?: Record<string, unknown>
}

export interface TrackingHistoryItem {
  at: Date
  status: ShipmentStatusInternal
  description?: string
}

export interface TrackingSnapshot {
  status: ShipmentStatusInternal
  carrierName: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  history: TrackingHistoryItem[]
}

export interface CancelResult {
  cancelled: boolean
  reason?: string
}
