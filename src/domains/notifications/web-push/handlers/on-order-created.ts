import { logger } from '@/lib/logger'
import type { OrderCreatedPayload } from '../../events'
import { sendWebPushToUser } from '../service'
import { orderCreatedPush } from '../templates'
import { resolveOrderPushView, resolveVendorUserId } from './shared'

export async function onOrderCreated(payload: OrderCreatedPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) {
    logger.warn('notifications.handler.skipped', {
      event: 'order.created',
      reason: 'no_vendor',
      handler: 'web-push.on-order-created',
      vendorId: payload.vendorId,
      orderId: payload.orderId,
    })
    return
  }
  const view = await resolveOrderPushView(payload.orderId, payload.vendorId)
  await sendWebPushToUser(userId, 'ORDER_CREATED', orderCreatedPush(payload, view), {
    payloadRef: `order:${payload.orderId}`,
  })
}
