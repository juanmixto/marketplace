export interface PrepareFulfillmentResult {
  ok: true
  fulfillmentId: string
  shipmentId: string
  labelUrl: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  carrierName: string | null
}

export interface PrepareFulfillmentError {
  ok: false
  code: string
  message: string
  retryable: boolean
}

export interface VendorAddressInput {
  label?: string | null
  contactName: string
  phone: string
  line1: string
  line2?: string | null
  city: string
  province: string
  postalCode: string
  countryCode?: string
}
