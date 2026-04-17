import { db } from '@/lib/db'
import type { OrderPendingPayload } from '../../events'
import { sendToUser } from '../service'
import { orderPendingTemplate } from '../templates'

export async function onOrderPending(payload: OrderPendingPayload): Promise<void> {
  const vendor = await db.vendor.findUnique({
    where: { id: payload.vendorId },
    select: { userId: true },
  })
  if (!vendor) return

  await sendToUser(vendor.userId, 'ORDER_PENDING', orderPendingTemplate(payload), {
    payloadRef: `order:${payload.orderId}`,
  })
}
