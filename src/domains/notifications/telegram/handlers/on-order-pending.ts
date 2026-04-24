import { db } from '@/lib/db'
import type { OrderPendingPayload } from '../../events'
import { sendToUser } from '../service'
import { orderPendingTemplate } from '../templates'
import { resolveOrderView } from './order-view'

export async function onOrderPending(payload: OrderPendingPayload): Promise<void> {
  const vendor = await db.vendor.findUnique({
    where: { id: payload.vendorId },
    select: { userId: true },
  })
  if (!vendor) return

  const view = await resolveOrderView(payload.orderId, payload.vendorId)
  await sendToUser(vendor.userId, 'ORDER_PENDING', orderPendingTemplate(payload, view), {
    payloadRef: `order:${payload.orderId}`,
  })
}
