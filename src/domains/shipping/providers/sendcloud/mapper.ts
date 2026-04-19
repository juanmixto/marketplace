import type {
  ShipmentDraft,
  ShipmentRecord,
  ShipmentStatusInternal,
  TrackingSnapshot,
} from '../../domain/types'
import type { SendcloudParcelCreate, SendcloudParcelResponse } from './client'

export function draftToSendcloud(
  draft: ShipmentDraft,
  senderAddressId: number | null,
): SendcloudParcelCreate {
  const weightKg = (draft.weightGrams / 1000).toFixed(3)
  return {
    parcel: {
      name: draft.to.contactName,
      company_name: draft.to.companyName,
      address: draft.to.line1,
      address_2: draft.to.line2,
      city: draft.to.city,
      postal_code: draft.to.postalCode,
      country: draft.to.countryCode,
      telephone: draft.to.phone,
      email: draft.to.email,
      order_number: draft.reference,
      weight: weightKg,
      request_label: true,
      sender_address: senderAddressId ?? undefined,
      parcel_items: draft.items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        weight: (item.weightGrams / 1000).toFixed(3),
        value: (item.unitPriceCents / 100).toFixed(2),
        sku: item.sku,
        hs_code: item.hsCode,
      })),
    },
  }
}

/**
 * Mapping for the subset of Sendcloud parcel status IDs we care about in
 * phase 1. Unknown IDs are passed through as LABEL_CREATED so that the
 * domain never crashes on an unexpected status code.
 *
 * Reference: https://api.sendcloud.dev/docs/sendcloud-public-api/parcel-statuses
 */
const STATUS_MAP: Record<number, ShipmentStatusInternal> = {
  999: 'LABEL_CREATED',
  1000: 'LABEL_CREATED',
  1500: 'IN_TRANSIT',
  1800: 'OUT_FOR_DELIVERY',
  11: 'DELIVERED',
  80: 'EXCEPTION',
  2000: 'CANCELLED',
}

export function mapSendcloudStatus(id: number): ShipmentStatusInternal {
  return STATUS_MAP[id] ?? 'LABEL_CREATED'
}

/**
 * Strict variant of `mapSendcloudStatus` used by the webhook path
 * (#568). Returns `null` when the provider sends an ID we don't know
 * about, so the caller can:
 *   - log `sendcloud.webhook.unknown_status` (visibility)
 *   - persist a `WebhookDeadLetter` row for operator triage
 *   - decline to mutate the shipment — silently coercing to
 *     LABEL_CREATED (the previous behaviour) hid provider contract
 *     drift that #568 explicitly wants surfaced.
 */
export function mapSendcloudStatusStrict(id: number): ShipmentStatusInternal | null {
  return STATUS_MAP[id] ?? null
}

export function sendcloudToRecord(
  response: SendcloudParcelResponse,
): ShipmentRecord {
  const parcel = response.parcel
  return {
    providerCode: 'SENDCLOUD',
    providerRef: String(parcel.id),
    status: mapSendcloudStatus(parcel.status.id),
    carrierName: parcel.carrier?.code ?? null,
    trackingNumber: parcel.tracking_number,
    trackingUrl: parcel.tracking_url,
    labelUrl: parcel.label?.normal_printer?.[0] ?? null,
    labelFormat: parcel.label ? 'pdf' : null,
    createdAt: new Date(),
    providerMeta: {
      statusId: parcel.status.id,
      statusMessage: parcel.status.message,
    },
  }
}

export function sendcloudToTracking(
  response: SendcloudParcelResponse,
): TrackingSnapshot {
  const parcel = response.parcel
  return {
    status: mapSendcloudStatus(parcel.status.id),
    carrierName: parcel.carrier?.code ?? null,
    trackingNumber: parcel.tracking_number,
    trackingUrl: parcel.tracking_url,
    history: [],
  }
}
