import { db } from '@/lib/db'
import { mapSendcloudStatus } from '@/domains/shipping/providers/sendcloud/mapper'
import {
  appendShipmentEvent,
  applyShipmentTransition,
} from '@/domains/shipping/actions'
import type { ShipmentStatusInternal } from '@/domains/shipping/domain/types'

export { verifySendcloudSignature } from './signature'

export interface SendcloudWebhookPayload {
  action?: string
  timestamp?: number
  parcel?: {
    id: number
    tracking_number?: string | null
    status: { id: number; message: string }
  }
}

/**
 * Processes a parsed Sendcloud webhook payload: locates the Shipment by
 * providerRef, maps the status, and routes through applyShipmentTransition.
 * Unrecognised events are logged as ShipmentEvent for audit but don't
 * cause transitions.
 */
export async function handleSendcloudWebhook(
  payload: SendcloudWebhookPayload,
): Promise<{ handled: boolean; reason?: string }> {
  const parcel = payload.parcel
  if (!parcel) return { handled: false, reason: 'no_parcel' }

  const providerRef = String(parcel.id)
  const shipment = await db.shipment.findFirst({
    where: { providerCode: 'SENDCLOUD', providerRef },
  })
  if (!shipment) {
    return { handled: false, reason: 'unknown_parcel' }
  }

  const nextStatus: ShipmentStatusInternal = mapSendcloudStatus(parcel.status.id)

  const occurredAt = payload.timestamp
    ? new Date(payload.timestamp * 1000)
    : new Date()

  // Always log the raw event for auditability, even if the transition
  // is a no-op (e.g. status already reached).
  await appendShipmentEvent({
    shipmentId: shipment.id,
    source: 'PROVIDER_WEBHOOK',
    type: `sendcloud.${payload.action ?? 'parcel_status_changed'}`,
    message: parcel.status.message,
    payload: payload as unknown,
    occurredAt,
  })

  await applyShipmentTransition({
    shipmentId: shipment.id,
    nextStatus,
    source: 'PROVIDER_WEBHOOK',
    type: `sendcloud.${payload.action ?? 'status_changed'}`,
    message: parcel.status.message,
    payload: payload as unknown,
    occurredAt,
  })

  return { handled: true }
}
