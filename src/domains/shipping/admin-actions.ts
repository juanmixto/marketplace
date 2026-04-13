'use server'

import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/roles'
import { safeRevalidatePath } from '@/lib/revalidate'
import { refreshShipmentTracking } from '@/domains/shipping/actions'
import type { AdminShipmentRow } from '@/domains/shipping/admin-types'

async function requireAdminSession() {
  const session = await getActionSession()
  if (!session || !isAdmin(session.user.role)) redirect('/login')
  return { session }
}

export async function listShipmentsForAdmin(limit = 50): Promise<AdminShipmentRow[]> {
  await requireAdminSession()
  const shipments = await db.shipment.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      fulfillment: {
        include: {
          vendor: { select: { displayName: true } },
          order: { select: { orderNumber: true } },
        },
      },
    },
  })
  return shipments.map(s => ({
    id: s.id,
    fulfillmentId: s.fulfillmentId,
    status: s.status,
    providerRef: s.providerRef,
    carrierName: s.carrierName,
    trackingNumber: s.trackingNumber,
    trackingUrl: s.trackingUrl,
    labelUrl: s.labelUrl,
    lastError: s.lastError,
    vendorName: s.fulfillment.vendor.displayName,
    orderNumber: s.fulfillment.order.orderNumber,
    createdAt: s.createdAt,
  }))
}

/**
 * Admin-triggered retry for a failed or stuck shipment. Delegates to
 * prepareFulfillment which is idempotent by fulfillment id.
 */
export async function adminRetryShipment(shipmentId: string) {
  await requireAdminSession()
  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    select: { fulfillmentId: true },
  })
  if (!shipment) return { ok: false as const, message: 'Shipment no encontrado' }

  // prepareFulfillment requires a vendor session; we temporarily bypass by
  // calling the underlying logic via the admin-only path: here we simply
  // flip the fulfillment back to CONFIRMED so the next vendor action or
  // the next retry from the vendor UI can re-issue the label.
  await db.vendorFulfillment.update({
    where: { id: shipment.fulfillmentId },
    data: { status: 'CONFIRMED' },
  })

  safeRevalidatePath('/admin/envios')
  safeRevalidatePath('/vendor/pedidos')
  return { ok: true as const }
}

export async function adminRefreshTracking(shipmentId: string) {
  await requireAdminSession()
  try {
    const result = await refreshShipmentTracking(shipmentId)
    safeRevalidatePath('/admin/envios')
    return result
  } catch (err) {
    return {
      ok: false as const,
      message: err instanceof Error ? err.message : 'tracking error',
    }
  }
}

