import type { OrderPendingPayload } from '../../events'
import { sendWebPushToUser } from '../service'
import { orderPendingPush } from '../templates'
import { resolveOrderPushView, resolveVendorUserId } from './shared'

export async function onOrderPending(payload: OrderPendingPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) return
  const view = await resolveOrderPushView(payload.orderId, payload.vendorId)
  await sendWebPushToUser(userId, 'ORDER_PENDING', orderPendingPush(payload, view), {
    payloadRef: `order:${payload.orderId}`,
  })
}
