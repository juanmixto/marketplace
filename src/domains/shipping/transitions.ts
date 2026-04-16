/**
 * Internal shipment transition helpers.
 *
 * These functions used to live in `actions.ts` (a `'use server'` module),
 * which exposed them as RPC endpoints any authenticated user could call
 * with arbitrary shipmentIds. They are pure service helpers — only the
 * Sendcloud webhook handler and other server actions in this domain
 * should reach them — so they live in a non-`'use server'` module to
 * keep them off the RPC surface.
 */

import { db } from '@/lib/db'
import { safeRevalidatePath } from '@/lib/revalidate'
import type { ShipmentStatusInternal } from '@/domains/shipping/domain/types'
import { isValidTransition } from '@/domains/shipping/domain/state-machine'
import type {
  FulfillmentStatus,
  ShipmentStatus,
  ShipmentEventSource,
} from '@/generated/prisma/enums'

export const SHIPMENT_TO_PRISMA: Record<ShipmentStatusInternal, ShipmentStatus> = {
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

export const PRISMA_TO_SHIPMENT: Record<ShipmentStatus, ShipmentStatusInternal> = {
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

export function fulfillmentStatusForShipment(
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

export interface AppendEventInput {
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

export interface ApplyTransitionInput {
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
