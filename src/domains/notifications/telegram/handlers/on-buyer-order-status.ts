import type { OrderStatusChangedPayload } from '../../events'
import { sendToUser } from '../service'
import { orderStatusChangedTemplate } from '../templates'

export async function onBuyerOrderStatus(
  payload: OrderStatusChangedPayload,
): Promise<void> {
  await sendToUser(
    payload.customerUserId,
    'BUYER_ORDER_STATUS',
    orderStatusChangedTemplate(payload),
    { payloadRef: `order:${payload.orderId}:${payload.status}` },
  )
}
