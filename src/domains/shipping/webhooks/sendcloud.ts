import { db } from '@/lib/db'
import { mapSendcloudStatusStrict } from '@/domains/shipping/providers/sendcloud/mapper'
import {
  appendShipmentEvent,
  applyShipmentTransition,
} from '@/domains/shipping/transitions'
import { logger } from '@/lib/logger'

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

export interface SendcloudWebhookOptions {
  /**
   * Stable id for the delivery — same shape as Stripe's `event.id`.
   * The route handler computes a SHA-256 of the raw body and passes
   * the first 32 chars; that gives identical payloads the same id and
   * duplicates collapse on the WebhookDelivery UNIQUE(provider, eventId).
   * If omitted (legacy callers / tests), dedupe is skipped.
   */
  eventId?: string
}

/**
 * Processes a parsed Sendcloud webhook payload: locates the Shipment by
 * providerRef, maps the status, and routes through applyShipmentTransition.
 * Unrecognised events are logged as ShipmentEvent for audit but don't
 * cause transitions.
 *
 * #1335: idempotent on the WebhookDelivery UNIQUE(provider, eventId).
 * Replays return `{ handled: false, reason: 'duplicate' }` without
 * touching shipment state. The previous "isValidTransition rejects
 * self-loops" path still works as a second line of defence but doesn't
 * cover same-rank-different-event ShipmentEvent rows.
 */
export async function handleSendcloudWebhook(
  payload: SendcloudWebhookPayload,
  opts: SendcloudWebhookOptions = {},
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

  if (opts.eventId) {
    try {
      await db.webhookDelivery.create({
        data: {
          provider: 'sendcloud',
          eventId: opts.eventId,
          eventType: `sendcloud.${payload.action ?? 'parcel_status_changed'}`,
          payloadHash: opts.eventId,
        },
      })
    } catch (insertError) {
      const isDuplicate =
        insertError instanceof Error &&
        /P2002|Unique constraint/i.test(insertError.message)
      if (isDuplicate) {
        logger.info('sendcloud.webhook.duplicate', {
          eventId: opts.eventId,
          providerRef,
          shipmentId: shipment.id,
        })
        return { handled: false, reason: 'duplicate' }
      }
      // Non-duplicate DB error: log and proceed. Failing open is safer
      // than failing closed (see Stripe handler at
      // src/app/api/webhooks/stripe/route.ts for the same rationale).
      logger.error('sendcloud.webhook.delivery_insert_failed', {
        eventId: opts.eventId,
        providerRef,
        error: insertError instanceof Error ? insertError.message : String(insertError),
      })
    }
  }

  const nextStatus = mapSendcloudStatusStrict(parcel.status.id)

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

  // #568: surface provider-side contract drift. Silently coercing
  // unknown IDs to LABEL_CREATED masked status changes — the route
  // now records a dead-letter row so operators can replay once the
  // mapper is updated. Crucially, we also DO NOT advance the
  // shipment state here: a no-op is safer than an incorrect one.
  if (nextStatus === null) {
    logger.warn('sendcloud.webhook.unknown_status', {
      shipmentId: shipment.id,
      providerRef,
      statusId: parcel.status.id,
      statusMessage: parcel.status.message,
    })
    return { handled: false, reason: 'unknown_status' }
  }

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
