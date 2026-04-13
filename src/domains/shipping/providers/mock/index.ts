import type { ShippingProvider } from '../ShippingProvider'
import type {
  CancelResult,
  ShipmentDraft,
  ShipmentRecord,
  TrackingSnapshot,
} from '../../domain/types'
import {
  ShippingNotFoundError,
  ShippingProviderUnavailableError,
  ShippingCancelForbiddenError,
} from '../../domain/errors'

export interface MockProviderOptions {
  failCreate?: boolean
  failCancel?: boolean
}

/**
 * In-memory implementation of ShippingProvider used by tests and local dev
 * when SHIPPING_PROVIDER is not configured.
 */
export class MockShippingProvider implements ShippingProvider {
  readonly code = 'SENDCLOUD' as const
  readonly store = new Map<string, ShipmentRecord>()
  private seq = 0

  constructor(private readonly opts: MockProviderOptions = {}) {}

  async createShipment(draft: ShipmentDraft): Promise<ShipmentRecord> {
    if (this.opts.failCreate) {
      throw new ShippingProviderUnavailableError('mock: createShipment failed')
    }
    this.seq += 1
    const providerRef = `mock-${this.seq}`
    const record: ShipmentRecord = {
      providerCode: 'SENDCLOUD',
      providerRef,
      status: 'LABEL_CREATED',
      carrierName: 'mock-carrier',
      trackingNumber: `TRK${this.seq.toString().padStart(8, '0')}`,
      trackingUrl: `https://tracking.mock/${providerRef}`,
      labelUrl: `https://labels.mock/${providerRef}.pdf`,
      labelFormat: 'pdf',
      createdAt: new Date(),
      providerMeta: { idempotencyKey: draft.idempotencyKey, reference: draft.reference },
    }
    this.store.set(providerRef, record)
    return record
  }

  async getShipment(providerRef: string): Promise<ShipmentRecord> {
    const record = this.store.get(providerRef)
    if (!record) throw new ShippingNotFoundError(providerRef)
    return record
  }

  async getTracking(providerRef: string): Promise<TrackingSnapshot> {
    const record = await this.getShipment(providerRef)
    return {
      status: record.status,
      carrierName: record.carrierName,
      trackingNumber: record.trackingNumber,
      trackingUrl: record.trackingUrl,
      history: [],
    }
  }

  async cancelShipment(providerRef: string): Promise<CancelResult> {
    if (this.opts.failCancel) {
      throw new ShippingCancelForbiddenError('mock: cancel not allowed')
    }
    const record = await this.getShipment(providerRef)
    this.store.set(providerRef, { ...record, status: 'CANCELLED' })
    return { cancelled: true }
  }
}
