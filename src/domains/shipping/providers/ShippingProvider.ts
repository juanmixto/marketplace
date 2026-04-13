import type {
  CancelResult,
  ShipmentDraft,
  ShipmentRecord,
  ShippingProviderCode,
  TrackingSnapshot,
} from '../domain/types'

export interface ShippingProvider {
  readonly code: ShippingProviderCode

  createShipment(draft: ShipmentDraft): Promise<ShipmentRecord>
  getShipment(providerRef: string): Promise<ShipmentRecord>
  getTracking(providerRef: string): Promise<TrackingSnapshot>
  cancelShipment(providerRef: string): Promise<CancelResult>
}
