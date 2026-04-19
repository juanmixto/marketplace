import { db } from '@/lib/db'
import type { OrderStatusChangedPayload } from '../../events'
import { sendWebPushToUser } from '../service'
import { orderStatusChangedPush } from '../templates'

export async function onBuyerOrderStatus(
  payload: OrderStatusChangedPayload,
): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: payload.orderId },
    select: {
      customer: { select: { firstName: true } },
      lines: {
        select: {
          quantity: true,
          product: { select: { name: true, unit: true } },
          productSnapshot: true,
        },
        take: 3,
      },
    },
  })

  const items = (order?.lines ?? []).map(line => {
    const name =
      line.product?.name ??
      (line.productSnapshot as { name?: string } | null)?.name ??
      'Producto'
    const unit = line.product?.unit ? ` ${line.product.unit}` : ''
    return `${line.quantity}×${unit} ${name}`.replace(/\s+/g, ' ').trim()
  })

  await sendWebPushToUser(
    payload.customerUserId,
    'BUYER_ORDER_STATUS',
    orderStatusChangedPush(payload, {
      buyerFirstName: order?.customer?.firstName ?? undefined,
      items: items.length > 0 ? items : undefined,
    }),
    { payloadRef: `order:${payload.orderId}:${payload.status}` },
  )
}
