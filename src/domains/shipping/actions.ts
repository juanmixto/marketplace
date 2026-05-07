'use server'

import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { redirect } from 'next/navigation'
import { isVendor, isAdmin } from '@/lib/roles'
import { safeRevalidatePath } from '@/lib/revalidate'
import { parseOrderAddressSnapshot } from '@/types/order'
import { parseOrderLineSnapshot } from '@/lib/order-line-snapshot'
import { getShippingProvider } from '@/domains/shipping/providers'
import { ShippingError } from '@/domains/shipping/domain/errors'
import type {
  ParcelItem,
  PostalAddress,
  ShipmentDraft,
  ShipmentRecord,
} from '@/domains/shipping/domain/types'
import {
  SHIPMENT_TO_PRISMA,
  PRISMA_TO_SHIPMENT,
  fulfillmentStatusForShipment,
  appendShipmentEvent,
  applyShipmentTransition,
  recomputeOrderStatusFromFulfillments,
} from '@/domains/shipping/transitions'
import type { FulfillmentStatus } from '@/generated/prisma/enums'
// eslint-disable-next-line no-restricted-imports -- dispatcher is intentionally server-only, excluded from notifications barrel
import { emit as emitNotification } from '@/domains/notifications/dispatcher'
import {
  canVendorOperateFulfillments,
  VENDOR_SUSPENDED_MESSAGE,
} from '@/domains/vendors/lifecycle-guard'

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function requireVendorSession() {
  const session = await getActionSession()
  if (!session || !isVendor(session.user.role)) redirect('/login')
  const vendor = await db.vendor.findUnique({ where: { userId: session.user.id } })
  if (!vendor) redirect('/login')
  // #1334: a suspended vendor cannot mutate shipping/fulfillment state.
  // Catalog visibility is gated separately. We throw here (instead of
  // redirecting) so the caller surfaces a structured error to the UI.
  if (!canVendorOperateFulfillments(vendor.status)) {
    throw new Error(VENDOR_SUSPENDED_MESSAGE)
  }
  return { session, vendor }
}

async function requireAdminSession() {
  const session = await getActionSession()
  if (!session || !isAdmin(session.user.role)) redirect('/login')
  return { session }
}

import type {
  PrepareFulfillmentResult,
  PrepareFulfillmentError,
} from '@/domains/shipping/action-types'

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
  return prepareFulfillmentForVendorId(vendor.id, fulfillmentId)
}

/**
 * Session-less variant used by out-of-band entrypoints (Telegram callback
 * handlers). The caller is responsible for proving the userId owns the
 * fulfillment; we scope the Prisma lookup by (id, vendor.userId) so a
 * foreign fulfillmentId returns NOT_FOUND instead of acting on it.
 */
export async function prepareFulfillmentByUserId(
  userId: string,
  fulfillmentId: string,
): Promise<PrepareFulfillmentResult | PrepareFulfillmentError> {
  const vendor = await db.vendor.findUnique({ where: { userId }, select: { id: true } })
  if (!vendor) {
    return { ok: false, code: 'NOT_FOUND', message: 'Fulfillment no encontrado', retryable: false }
  }
  return prepareFulfillmentForVendorId(vendor.id, fulfillmentId)
}

async function prepareFulfillmentForVendorId(
  vendorId: string,
  fulfillmentId: string,
): Promise<PrepareFulfillmentResult | PrepareFulfillmentError> {
  const fulfillment = await db.vendorFulfillment.findFirst({
    where: { id: fulfillmentId, vendorId },
    include: {
      shipment: true,
      order: {
        include: {
          lines: {
            where: { vendorId },
            include: { product: { select: { name: true, weightGrams: true } } },
          },
        },
      },
      vendor: { select: { status: true } },
    },
  })

  if (!fulfillment) {
    return { ok: false, code: 'NOT_FOUND', message: 'Fulfillment no encontrado', retryable: false }
  }
  // #1334: a suspended vendor must not progress fulfillments.
  if (!canVendorOperateFulfillments(fulfillment.vendor.status)) {
    return {
      ok: false,
      code: 'VENDOR_SUSPENDED',
      message: VENDOR_SUSPENDED_MESSAGE,
      retryable: false,
    }
  }

  if (!['PENDING', 'CONFIRMED', 'PREPARING', 'LABEL_FAILED'].includes(fulfillment.status)) {
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
    // Reconcile VendorFulfillment if it drifted behind the Shipment (e.g. a
    // prior run crashed between provider success and the fulfillment update,
    // or seeded data is inconsistent). Without this the vendor UI would keep
    // offering "Generar etiqueta" forever on a fulfillment that already has
    // a label, and the click would silently short-circuit here.
    const reconciledStatus = fulfillmentStatusForShipment(
      PRISMA_TO_SHIPMENT[fulfillment.shipment.status],
    )
    if (reconciledStatus && reconciledStatus !== fulfillment.status) {
      await db.vendorFulfillment.update({
        where: { id: fulfillment.id },
        data: {
          status: reconciledStatus,
          trackingNumber: fulfillment.shipment.trackingNumber ?? fulfillment.trackingNumber,
          carrier: fulfillment.shipment.carrierName ?? fulfillment.carrier,
        },
      })
      safeRevalidatePath('/vendor/pedidos')
    }
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

  const vendorAddress = await getDefaultVendorAddress(vendorId)
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
    reference: buildReference(fulfillment.orderId, vendorId),
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
    message: `Vendor ${vendorId} requested label`,
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
    emitNotification('label.failed', {
      orderId: fulfillment.orderId,
      vendorId,
      fulfillmentId,
      errorMessage: message,
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

  // Nudge the vendor to mark the parcel as shipped. `applyShipmentTransition`
  // already emits this when Sendcloud drives the move to READY via webhook,
  // but the manual/mock path lands here without going through that helper,
  // so we emit too. De-duplication would require a delivery-log lookup; for
  // now rely on the notification preference to silence if noisy.
  if (fulfillmentStatusForShipment(record.status) === 'READY') {
    emitNotification('order.pending', {
      orderId: fulfillment.orderId,
      vendorId,
      fulfillmentId,
      reason: 'NEEDS_SHIPMENT',
    })
  }

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

  // #1336: a vendor cancel can leave the order with all-cancelled
  // fulfillments (single-vendor order) or a mix that no longer matches
  // the parent status. Re-derive Order.status from the fulfillment set
  // so the FSM stays consistent without needing the admin to babysit.
  await recomputeOrderStatusFromFulfillments(fulfillment.orderId)

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

/**
 * Vendor action. Clears an incident flag and restores the fulfillment to
 * the state it should be in based on its shipment. Lets a vendor recover
 * without admin intervention when they mark an incident by mistake or
 * resolve the underlying issue on their own.
 */
export async function resolveFulfillmentIncident(fulfillmentId: string) {
  const { vendor } = await requireVendorSession()
  const fulfillment = await db.vendorFulfillment.findFirst({
    where: { id: fulfillmentId, vendorId: vendor.id },
    include: { shipment: true },
  })
  if (!fulfillment) return { ok: false as const, message: 'No encontrado' }
  if (fulfillment.status !== 'INCIDENT') {
    return { ok: false as const, message: 'El pedido no está en incidencia' }
  }

  const nextStatus: FulfillmentStatus = fulfillment.shipment
    ? (fulfillmentStatusForShipment(
        PRISMA_TO_SHIPMENT[fulfillment.shipment.status],
      ) ?? 'READY')
    : 'PENDING'

  await db.vendorFulfillment.update({
    where: { id: fulfillmentId },
    data: { status: nextStatus },
  })
  safeRevalidatePath('/vendor/pedidos')
  return { ok: true as const }
}

// Internal transition helpers (applyShipmentTransition, appendShipmentEvent,
// status maps) live in `transitions.ts` to keep them off the server-action
// RPC surface. They are re-imported above for use by the actions in this file.
