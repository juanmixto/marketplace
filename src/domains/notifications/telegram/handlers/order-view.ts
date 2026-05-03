import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { parseOrderAddressSnapshot } from '@/types/order'
import type { OrderMessageView } from '../templates'

/**
 * Resolves the human-friendly view for an order so Telegram messages can
 * show a real order number, the shipping city, a one-line summary of
 * the vendor's lines, and the names of the two humans involved
 * (vendor + buyer) instead of a meaningless last-8-CUID-chars hash.
 *
 * Returns undefined on any lookup failure so the template falls back to
 * the short-hash rendering — better a stripped-down notification than a
 * missed one.
 */
export async function resolveOrderView(
  orderId: string,
  vendorId: string,
): Promise<OrderMessageView | undefined> {
  const [order, vendor] = await Promise.all([
    db.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        shippingAddressSnapshot: true,
        address: { select: { city: true } },
        customer: { select: { firstName: true } },
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
    }),
    db.vendor.findUnique({
      where: { id: vendorId },
      select: { displayName: true, user: { select: { firstName: true } } },
    }),
  ])
  if (!order) {
    logger.warn('notifications.handler.skipped', {
      event: 'order.view',
      reason: 'no_order',
      handler: 'telegram.resolve-order-view',
      orderId,
      vendorId,
    })
    return undefined
  }

  const shippingAddress = parseOrderAddressSnapshot(order.shippingAddressSnapshot)
  const city = shippingAddress?.city ?? order.address?.city ?? undefined
  const buyerFirstName =
    shippingAddress?.firstName ?? order.customer?.firstName ?? undefined
  const buyerName = shippingAddress
    ? `${shippingAddress.firstName} ${shippingAddress.lastName}`.trim()
    : undefined

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
    vendorFirstName: vendor?.user?.firstName ?? vendor?.displayName ?? undefined,
    buyerFirstName,
    buyerName,
  }
}

/**
 * Lightweight lookup of the vendor's user-level display name for the
 * alert messages that don't need full order context (stock low, payout,
 * review). Returns undefined if the vendor is gone — caller should
 * still send the raw message.
 */
export async function resolveVendorFirstName(
  vendorId: string,
): Promise<string | undefined> {
  const vendor = await db.vendor.findUnique({
    where: { id: vendorId },
    select: { displayName: true, user: { select: { firstName: true } } },
  })
  return vendor?.user?.firstName ?? vendor?.displayName ?? undefined
}
