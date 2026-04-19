import { db } from '@/lib/db'
import { parseOrderAddressSnapshot } from '@/types/order'
import type { OrderPushView } from '../templates'

/**
 * Mirror of the Telegram handler's `resolveOrderView` — kept local so
 * the web-push domain does not reach into `notifications/telegram/`
 * (the audit would flag a cross-transport deep import). The query
 * shape is identical by intent; any divergence between the two
 * transports' `view` shapes would silently starve one channel of
 * personalization fields.
 */
export async function resolveOrderPushView(
  orderId: string,
  vendorId: string,
): Promise<OrderPushView | undefined> {
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
    vendorFirstName: vendor?.user?.firstName ?? vendor?.displayName ?? undefined,
    buyerFirstName: order.customer?.firstName ?? undefined,
  }
}

export async function resolveVendorFirstName(
  vendorId: string,
): Promise<string | undefined> {
  const vendor = await db.vendor.findUnique({
    where: { id: vendorId },
    select: { displayName: true, user: { select: { firstName: true } } },
  })
  return vendor?.user?.firstName ?? vendor?.displayName ?? undefined
}

export async function resolveVendorUserId(vendorId: string): Promise<string | null> {
  const vendor = await db.vendor.findUnique({
    where: { id: vendorId },
    select: { userId: true },
  })
  return vendor?.userId ?? null
}
