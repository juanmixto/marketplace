import type { OrderCreatedPayload } from '../../events'
import { sendWebPushToUser } from '../service'
import { orderCreatedPush } from '../templates'
import { resolveOrderPushView, resolveVendorUserId } from './shared'

export async function onOrderCreated(payload: OrderCreatedPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) return
  const view = await resolveOrderPushView(payload.orderId, payload.vendorId)
  await sendWebPushToUser(userId, 'ORDER_CREATED', orderCreatedPush(payload, view), {
    payloadRef: `order:${payload.orderId}`,
  })
}
