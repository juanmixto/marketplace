export interface AdminShipmentRow {
  id: string
  fulfillmentId: string
  status: string
  providerRef: string | null
  carrierName: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  labelUrl: string | null
  lastError: string | null
  vendorName: string
  orderNumber: string
  createdAt: Date
}
