import { db } from '@/lib/db'
import type { OrderCreatedPayload } from '../../events'
import { sendToUser } from '../service'
import { orderCreatedTemplate } from '../templates'

export async function onOrderCreated(payload: OrderCreatedPayload): Promise<void> {
  const vendor = await db.vendor.findUnique({
    where: { id: payload.vendorId },
    select: { userId: true },
  })
  if (!vendor) return

  await sendToUser(vendor.userId, 'ORDER_CREATED', orderCreatedTemplate(payload), {
    payloadRef: `order:${payload.orderId}`,
  })
}
