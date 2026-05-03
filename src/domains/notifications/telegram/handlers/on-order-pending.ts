import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { OrderPendingPayload } from '../../events'
import { sendToUser } from '../service'
import { orderPendingTemplate } from '../templates'
import { resolveOrderView } from './order-view'

export async function onOrderPending(payload: OrderPendingPayload): Promise<void> {
  const vendor = await db.vendor.findUnique({
    where: { id: payload.vendorId },
    select: { userId: true },
  })
  if (!vendor) {
    logger.warn('notifications.handler.skipped', {
      event: 'order.pending',
      reason: 'no_vendor',
      handler: 'telegram.on-order-pending',
      vendorId: payload.vendorId,
      orderId: payload.orderId,
    })
    return
  }

  const view = await resolveOrderView(payload.orderId, payload.vendorId)
  await sendToUser(vendor.userId, 'ORDER_PENDING', orderPendingTemplate(payload, view), {
    payloadRef: `order:${payload.orderId}`,
  })
}
