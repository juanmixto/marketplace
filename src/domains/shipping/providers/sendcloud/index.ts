import type { ShippingProvider } from '../ShippingProvider'
import type {
  CancelResult,
  ShipmentDraft,
  ShipmentRecord,
  TrackingSnapshot,
} from '../../domain/types'
import { ShippingCancelForbiddenError } from '../../domain/errors'
import { SendcloudClient } from './client'
import { loadSendcloudConfig, type SendcloudConfig } from './config'
import {
  draftToSendcloud,
  sendcloudToRecord,
  sendcloudToTracking,
} from './mapper'

export class SendcloudProvider implements ShippingProvider {
  readonly code = 'SENDCLOUD' as const
  private readonly client: SendcloudClient

  constructor(private readonly config: SendcloudConfig = loadSendcloudConfig()) {
    this.client = new SendcloudClient(config)
  }

  async createShipment(draft: ShipmentDraft): Promise<ShipmentRecord> {
    const body = draftToSendcloud(draft, this.config.defaultSenderId)
    const res = await this.client.createParcel(body, draft.idempotencyKey)
    return sendcloudToRecord(res)
  }

  async getShipment(providerRef: string): Promise<ShipmentRecord> {
    const res = await this.client.getParcel(providerRef)
    return sendcloudToRecord(res)
  }

  async getTracking(providerRef: string): Promise<TrackingSnapshot> {
    const res = await this.client.getParcel(providerRef)
    return sendcloudToTracking(res)
  }

  async cancelShipment(providerRef: string): Promise<CancelResult> {
    const res = await this.client.cancelParcel(providerRef)
    if (res.status === 'cancelled' || res.status === 'queued') {
      return { cancelled: true, reason: res.message }
    }
    throw new ShippingCancelForbiddenError(res.message || 'Cancel not allowed')
  }
}
