import { db } from '@/lib/db'
import { parseOrderAddressSnapshot } from '@/types/order'
import type { OrderMessageView } from '../templates'

/**
 * Resolves the human-friendly view for an order so Telegram messages can
 * show a real order number, the shipping city, and a one-line summary of
 * the vendor's lines instead of a meaningless last-8-CUID-chars hash.
 *
 * Returns undefined on any lookup failure so the template falls back to
 * the short-hash rendering — better a stripped-down notification than a
 * missed one.
 */
export async function resolveOrderView(
  orderId: string,
  vendorId: string,
): Promise<OrderMessageView | undefined> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      shippingAddressSnapshot: true,
      address: { select: { city: true } },
      lines: {
        where: { vendorId },
        select: {
          quantity: true,
          product: { select: { name: true, unit: true } },
          productSnapshot: true,
        },
        take: 3,
      },
    },
  })
  if (!order) return undefined

  const shippingAddress = parseOrderAddressSnapshot(order.shippingAddressSnapshot)
  const city = shippingAddress?.city ?? order.address?.city ?? undefined

  const items = order.lines.map(line => {
    const name =
      line.product?.name ??
      (line.productSnapshot as { name?: string } | null)?.name ??
      'Producto'
    const unit = line.product?.unit ? ` ${line.product.unit}` : ''
    return `${line.quantity}×${unit} ${name}`.replace(/\s+/g, ' ').trim()
  })

  return {
    orderNumber: order.orderNumber,
    city,
    items: items.length > 0 ? items : undefined,
  }
}
