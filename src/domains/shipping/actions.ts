'use server'

import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { redirect } from 'next/navigation'
import { isVendor, isAdmin } from '@/lib/roles'
import { safeRevalidatePath } from '@/lib/revalidate'
import { parseOrderAddressSnapshot } from '@/types/order'
import { parseOrderLineSnapshot } from '@/domains/orders/order-line-snapshot'
import { getShippingProvider } from '@/domains/shipping/providers'
import {
  ShippingError,
  ShippingValidationError,
} from '@/domains/shipping/domain/errors'
import type {
  ParcelItem,
  PostalAddress,
  ShipmentDraft,
  ShipmentRecord,
  ShipmentStatusInternal,
} from '@/domains/shipping/domain/types'
import { isValidTransition } from '@/domains/shipping/domain/state-machine'
import type {
  FulfillmentStatus,
  ShipmentStatus,
  ShipmentEventSource,
} from '@/generated/prisma/enums'

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function requireVendorSession() {
  const session = await getActionSession()
  if (!session || !isVendor(session.user.role)) redirect('/login')
  const vendor = await db.vendor.findUnique({ where: { userId: session.user.id } })
  if (!vendor) redirect('/login')
  return { session, vendor }
}

async function requireAdminSession() {
  const session = await getActionSession()
  if (!session || !isAdmin(session.user.role)) redirect('/login')
  return { session }
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GRAM_PER_LINE_FALLBACK = 500

function buildReference(orderId: string, vendorId: string): string {
  return `${orderId.slice(-8)}-${vendorId.slice(-6)}`.toUpperCase()
}

function buildIdempotencyKey(fulfillmentId: string): string {
  return `fulfillment:${fulfillmentId}:v1`
}

/**
 * Picks the default vendor address. Returns null if the vendor has not
 * configured one yet (phase 1 gates label creation on this).
 */
async function getDefaultVendorAddress(vendorId: string) {
  return db.vendorAddress.findFirst({
    where: { vendorId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })
}

interface LineForDraft {
  productId: string
  quantity: number
  unitPrice: { toString(): string }
  productSnapshot: unknown
  product: { name: string; weightGrams?: number | null } | null
}

function toParcelItems(lines: LineForDraft[]): ParcelItem[] {
  return lines.map(line => {
    const snapshot = parseOrderLineSnapshot(line.productSnapshot)
    const description = snapshot?.name ?? line.product?.name ?? 'Producto'
    const weightGrams = line.product?.weightGrams ?? GRAM_PER_LINE_FALLBACK
    return {
      description,
      quantity: line.quantity,
      weightGrams,
      unitPriceCents: Math.round(Number(line.unitPrice) * 100),
      sku: line.productId,
    }
  })
}

function totalWeight(items: ParcelItem[]): number {
  const total = items.reduce((acc, item) => acc + item.weightGrams * item.quantity, 0)
  return total > 0 ? total : GRAM_PER_LINE_FALLBACK
}

function toFromAddress(addr: {
  contactName: string
  phone: string
  line1: string
  line2: string | null
  city: string
  province: string
  postalCode: string
  countryCode: string
}): PostalAddress {
  return {
    contactName: addr.contactName,
    phone: addr.phone,
    line1: addr.line1,
    line2: addr.line2 ?? undefined,
    city: addr.city,
    province: addr.province,
    postalCode: addr.postalCode,
    countryCode: addr.countryCode,
  }
}

// ─── Status mapping ───────────────────────────────────────────────────────────

const SHIPMENT_TO_PRISMA: Record<ShipmentStatusInternal, ShipmentStatus> = {
  DRAFT: 'DRAFT',
  LABEL_REQUESTED: 'LABEL_REQUESTED',
  LABEL_CREATED: 'LABEL_CREATED',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  EXCEPTION: 'EXCEPTION',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
}

const PRISMA_TO_SHIPMENT: Record<ShipmentStatus, ShipmentStatusInternal> = {
  DRAFT: 'DRAFT',
  LABEL_REQUESTED: 'LABEL_REQUESTED',
  LABEL_CREATED: 'LABEL_CREATED',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  EXCEPTION: 'EXCEPTION',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
}

function fulfillmentStatusForShipment(
  status: ShipmentStatusInternal,
): FulfillmentStatus | null {
  switch (status) {
    case 'LABEL_CREATED':
      return 'READY'
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY':
      return 'SHIPPED'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'FAILED':
      return 'LABEL_FAILED'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return null
  }
}

// ─── Core: prepareFulfillment ─────────────────────────────────────────────────

/**
 * Vendor action. Creates a shipment for the fulfillment if the status
 * allows it, calls the provider to issue the label, persists the
 * resulting Shipment/ShipmentEvent and advances the fulfillment to READY.
 *
 * Idempotent per fulfillmentId: if a Shipment already exists for this
 * fulfillment and is in a non-terminal state, we return it instead of
 * creating a duplicate.
 */
export async function prepareFulfillment(
  fulfillmentId: string,
): Promise<PrepareFulfillmentResult | PrepareFulfillmentError> {
  const { vendor } = await requireVendorSession()

  const fulfillment = await db.vendorFulfillment.findFirst({
    where: { id: fulfillmentId, vendorId: vendor.id },
    include: {
      shipment: true,
      order: {
        include: {
          lines: {
            where: { vendorId: vendor.id },
            include: { product: { select: { name: true, weightGrams: true } } },
          },
        },
      },
    },
  })

  if (!fulfillment) {
    return { ok: false, code: 'NOT_FOUND', message: 'Fulfillment no encontrado', retryable: false }
  }

  if (!['CONFIRMED', 'PREPARING', 'LABEL_FAILED'].includes(fulfillment.status)) {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: `No se puede preparar desde el estado ${fulfillment.status}`,
      retryable: false,
    }
  }

  // Idempotency short-circuit: if a shipment already has a label, return it.
  if (
    fulfillment.shipment &&
    ['LABEL_CREATED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(
      fulfillment.shipment.status,
    )
  ) {
    return {
      ok: true,
      fulfillmentId: fulfillment.id,
      shipmentId: fulfillment.shipment.id,
      labelUrl: fulfillment.shipment.labelUrl,
      trackingNumber: fulfillment.shipment.trackingNumber,
      trackingUrl: fulfillment.shipment.trackingUrl,
      carrierName: fulfillment.shipment.carrierName,
    }
  }

  const vendorAddress = await getDefaultVendorAddress(vendor.id)
  if (!vendorAddress) {
    return {
      ok: false,
      code: 'VENDOR_ADDRESS_MISSING',
      message: 'Configura tu dirección de origen antes de preparar pedidos',
      retryable: false,
    }
  }

  const shippingAddress = parseOrderAddressSnapshot(fulfillment.order.shippingAddressSnapshot)
  if (!shippingAddress) {
    return {
      ok: false,
      code: 'SHIPPING_ADDRESS_MISSING',
      message: 'El pedido no tiene dirección de envío válida',
      retryable: false,
    }
  }

  const items = toParcelItems(fulfillment.order.lines)
  const weightGrams = totalWeight(items)

  const from: PostalAddress = toFromAddress({
    contactName: vendorAddress.contactName,
    phone: vendorAddress.phone,
    line1: vendorAddress.line1,
    line2: vendorAddress.line2,
    city: vendorAddress.city,
    province: vendorAddress.province,
    postalCode: vendorAddress.postalCode,
    countryCode: vendorAddress.countryCode,
  })

  const to: PostalAddress = {
    contactName: `${shippingAddress.firstName} ${shippingAddress.lastName}`.trim(),
    phone: shippingAddress.phone ?? vendorAddress.phone,
    line1: shippingAddress.line1,
    line2: shippingAddress.line2 ?? undefined,
    city: shippingAddress.city,
    province: shippingAddress.province,
    postalCode: shippingAddress.postalCode,
    countryCode: 'ES',
  }

  const idempotencyKey = buildIdempotencyKey(fulfillmentId)
  const draft: ShipmentDraft = {
    idempotencyKey,
    reference: buildReference(fulfillment.orderId, vendor.id),
    from,
    to,
    weightGrams,
    parcelCount: 1,
    items,
  }

  // Phase 1: upsert the Shipment row in LABEL_REQUESTED before calling the
  // provider, so a crash mid-call leaves a record we can reconcile.
  const shipment = await db.shipment.upsert({
    where: { fulfillmentId },
    create: {
      fulfillmentId,
      providerCode: 'SENDCLOUD',
      status: 'LABEL_REQUESTED',
      fromAddressSnapshot: from as unknown as object,
      toAddressSnapshot: to as unknown as object,
      weightGrams,
      parcelCount: 1,
      idempotencyKey,
      labelRequestedAt: new Date(),
    },
    update: {
      status: 'LABEL_REQUESTED',
      labelRequestedAt: new Date(),
      lastError: null,
    },
  })

  await db.vendorFulfillment.update({
    where: { id: fulfillmentId },
    data: { status: 'LABEL_REQUESTED', vendorAddressId: vendorAddress.id },
  })

  await appendShipmentEvent({
    shipmentId: shipment.id,
    source: 'MANUAL_VENDOR',
    type: 'label.requested',
    status: 'LABEL_REQUESTED',
    message: `Vendor ${vendor.id} requested label`,
  })

  let record: ShipmentRecord
  try {
    const provider = getShippingProvider()
    record = await provider.createShipment(draft)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown provider error'
    const retryable = err instanceof ShippingError ? err.retryable : false
    await db.shipment.update({
      where: { id: shipment.id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        lastError: message,
      },
    })
    await db.vendorFulfillment.update({
      where: { id: fulfillmentId },
      data: { status: 'LABEL_FAILED' },
    })
    await appendShipmentEvent({
      shipmentId: shipment.id,
      source: 'SYSTEM',
      type: 'label.failed',
      status: 'FAILED',
      message,
    })
    safeRevalidatePath('/vendor/pedidos')
    return {
      ok: false,
      code: err instanceof ShippingError ? err.code : 'PROVIDER_ERROR',
      message,
      retryable,
    }
  }

  const updatedShipment = await db.shipment.update({
    where: { id: shipment.id },
    data: {
      status: SHIPMENT_TO_PRISMA[record.status],
      providerRef: record.providerRef,
      carrierName: record.carrierName,
      trackingNumber: record.trackingNumber,
      trackingUrl: record.trackingUrl,
      labelUrl: record.labelUrl,
      labelFormat: record.labelFormat,
      labelCreatedAt: new Date(),
      providerMeta: (record.providerMeta ?? null) as unknown as object,
      lastError: null,
    },
  })

  // Mirror legacy columns so the existing vendor UI keeps working.
  await db.vendorFulfillment.update({
    where: { id: fulfillmentId },
    data: {
      status: fulfillmentStatusForShipment(record.status) ?? 'READY',
      trackingNumber: record.trackingNumber,
      carrier: record.carrierName,
    },
  })

  await appendShipmentEvent({
    shipmentId: updatedShipment.id,
    source: 'SYSTEM',
    type: 'label.created',
    status: SHIPMENT_TO_PRISMA[record.status],
    message: `Provider ${record.providerCode} ref=${record.providerRef}`,
  })

  safeRevalidatePath('/vendor/pedidos')

  return {
    ok: true,
    fulfillmentId: fulfillment.id,
    shipmentId: updatedShipment.id,
    labelUrl: record.labelUrl,
    trackingNumber: record.trackingNumber,
    trackingUrl: record.trackingUrl,
    carrierName: record.carrierName,
  }
}

// ─── Retry ────────────────────────────────────────────────────────────────────

export async function retryLabel(fulfillmentId: string) {
  return prepareFulfillment(fulfillmentId)
}

// ─── Tracking polling (admin) ─────────────────────────────────────────────────

export async function refreshShipmentTracking(shipmentId: string) {
  await requireAdminSession()
  const shipment = await db.shipment.findUnique({ where: { id: shipmentId } })
  if (!shipment || !shipment.providerRef) {
    return { ok: false as const, message: 'Shipment sin providerRef' }
  }
  const provider = getShippingProvider()
  const tracking = await provider.getTracking(shipment.providerRef)
  await applyShipmentTransition({
    shipmentId: shipment.id,
    nextStatus: tracking.status,
    source: 'MANUAL_ADMIN',
    type: 'tracking.refresh',
    message: `status=${tracking.status}`,
  })
  return { ok: true as const, status: tracking.status }
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

export async function cancelShipmentAction(fulfillmentId: string) {
  const { vendor } = await requireVendorSession()
  const fulfillment = await db.vendorFulfillment.findFirst({
    where: { id: fulfillmentId, vendorId: vendor.id },
    include: { shipment: true },
  })
  if (!fulfillment) return { ok: false as const, message: 'No encontrado' }

  if (fulfillment.shipment && fulfillment.shipment.providerRef) {
    const provider = getShippingProvider()
    try {
      await provider.cancelShipment(fulfillment.shipment.providerRef)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'cancel error'
      return { ok: false as const, message }
    }
    await db.shipment.update({
      where: { id: fulfillment.shipment.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })
    await appendShipmentEvent({
      shipmentId: fulfillment.shipment.id,
      source: 'MANUAL_VENDOR',
      type: 'shipment.cancelled',
      status: 'CANCELLED',
    })
  }

  await db.vendorFulfillment.update({
    where: { id: fulfillmentId },
    data: { status: 'CANCELLED' },
  })

  safeRevalidatePath('/vendor/pedidos')
  return { ok: true as const }
}

// ─── Incident ─────────────────────────────────────────────────────────────────

export async function markFulfillmentIncident(fulfillmentId: string) {
  const { vendor } = await requireVendorSession()
  const fulfillment = await db.vendorFulfillment.findFirst({
    where: { id: fulfillmentId, vendorId: vendor.id },
  })
  if (!fulfillment) return { ok: false as const, message: 'No encontrado' }
  await db.vendorFulfillment.update({
    where: { id: fulfillmentId },
    data: { status: 'INCIDENT' },
  })
  safeRevalidatePath('/vendor/pedidos')
  return { ok: true as const }
}

// ─── Internal transition helpers ──────────────────────────────────────────────

interface AppendEventInput {
  shipmentId: string
  source: ShipmentEventSource
  type: string
  status?: ShipmentStatus
  message?: string
  payload?: unknown
  occurredAt?: Date
}

export async function appendShipmentEvent(input: AppendEventInput): Promise<void> {
  await db.shipmentEvent.create({
    data: {
      shipmentId: input.shipmentId,
      source: input.source,
      type: input.type,
      status: input.status,
      message: input.message,
      payload: (input.payload ?? null) as unknown as object,
      occurredAt: input.occurredAt ?? new Date(),
    },
  })
}

interface ApplyTransitionInput {
  shipmentId: string
  nextStatus: ShipmentStatusInternal
  source: ShipmentEventSource
  type: string
  message?: string
  payload?: unknown
  occurredAt?: Date
}

/**
 * Applies a shipment transition if legal, writes the ShipmentEvent,
 * mirrors to the parent VendorFulfillment and recomputes the parent
 * Order status. Called by both the webhook handler and admin actions.
 */
export async function applyShipmentTransition(input: ApplyTransitionInput) {
  const shipment = await db.shipment.findUnique({
    where: { id: input.shipmentId },
    include: { fulfillment: true },
  })
  if (!shipment) return { applied: false as const, reason: 'not_found' }

  const current = PRISMA_TO_SHIPMENT[shipment.status]
  if (!isValidTransition(current, input.nextStatus)) {
    await appendShipmentEvent({
      shipmentId: shipment.id,
      source: input.source,
      type: `${input.type}.rejected`,
      message: `from=${current} to=${input.nextStatus}`,
      payload: input.payload,
      occurredAt: input.occurredAt,
    })
    return { applied: false as const, reason: 'invalid_transition' }
  }

  const now = new Date()
  await db.shipment.update({
    where: { id: shipment.id },
    data: {
      status: SHIPMENT_TO_PRISMA[input.nextStatus],
      handedOverAt: input.nextStatus === 'IN_TRANSIT' ? now : undefined,
      deliveredAt: input.nextStatus === 'DELIVERED' ? now : undefined,
      cancelledAt: input.nextStatus === 'CANCELLED' ? now : undefined,
      failedAt: input.nextStatus === 'FAILED' ? now : undefined,
    },
  })

  await appendShipmentEvent({
    shipmentId: shipment.id,
    source: input.source,
    type: input.type,
    status: SHIPMENT_TO_PRISMA[input.nextStatus],
    message: input.message,
    payload: input.payload,
    occurredAt: input.occurredAt,
  })

  const nextFulfillment = fulfillmentStatusForShipment(input.nextStatus)
  if (nextFulfillment) {
    await db.vendorFulfillment.update({
      where: { id: shipment.fulfillmentId },
      data: {
        status: nextFulfillment,
        ...(nextFulfillment === 'SHIPPED' && { shippedAt: now }),
        ...(nextFulfillment === 'DELIVERED' && { deliveredAt: now }),
      },
    })
    await recomputeOrderStatus(shipment.fulfillment.orderId)
  }

  safeRevalidatePath('/vendor/pedidos')
  return { applied: true as const }
}

async function recomputeOrderStatus(orderId: string): Promise<void> {
  const fulfillments = await db.vendorFulfillment.findMany({
    where: { orderId },
    select: { status: true },
  })
  if (fulfillments.length === 0) return

  const anyShipped = fulfillments.some(f =>
    ['SHIPPED', 'DELIVERED'].includes(f.status),
  )
  const allShipped = fulfillments.every(f =>
    ['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(f.status),
  )
  const allDelivered = fulfillments.every(f =>
    ['DELIVERED', 'CANCELLED'].includes(f.status),
  )

  let next: 'PROCESSING' | 'PARTIALLY_SHIPPED' | 'SHIPPED' | 'DELIVERED' | null = null
  if (allDelivered) next = 'DELIVERED'
  else if (allShipped) next = 'SHIPPED'
  else if (anyShipped) next = 'PARTIALLY_SHIPPED'

  if (next) {
    await db.order.update({ where: { id: orderId }, data: { status: next } })
  }
}

// Avoid unused import warnings in strict mode (ShippingValidationError is
// intentionally exported type for future validators).
export type { ShippingValidationError }
