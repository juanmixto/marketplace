import { db } from '@/lib/db'
import type { OrderCreatedPayload } from '../../events'
import { sendToUser } from '../service'
import { orderCreatedTemplate } from '../templates'
import { resolveOrderView } from './order-view'

export async function onOrderCreated(payload: OrderCreatedPayload): Promise<void> {
  const vendor = await db.vendor.findUnique({
    where: { id: payload.vendorId },
    select: { userId: true },
  })
  if (!vendor) return

  const view = await resolveOrderView(payload.orderId, payload.vendorId)
  await sendToUser(vendor.userId, 'ORDER_CREATED', orderCreatedTemplate(payload, view), {
    payloadRef: `order:${payload.orderId}`,
  })
}
