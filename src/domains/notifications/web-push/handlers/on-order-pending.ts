import { logger } from '@/lib/logger'
import type { OrderPendingPayload } from '../../events'
import { sendWebPushToUser } from '../service'
import { orderPendingPush } from '../templates'
import { resolveOrderPushView, resolveVendorUserId } from './shared'

export async function onOrderPending(payload: OrderPendingPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) {
    logger.warn('notifications.handler.skipped', {
      event: 'order.pending',
      reason: 'no_vendor',
      handler: 'web-push.on-order-pending',
      vendorId: payload.vendorId,
      orderId: payload.orderId,
    })
    return
  }
  const view = await resolveOrderPushView(payload.orderId, payload.vendorId)
  await sendWebPushToUser(userId, 'ORDER_PENDING', orderPendingPush(payload, view), {
    payloadRef: `order:${payload.orderId}`,
  })
}
