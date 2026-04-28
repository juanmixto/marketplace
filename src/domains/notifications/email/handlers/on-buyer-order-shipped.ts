import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { OrderShippedEmail } from '@/emails/OrderShipped'
import { logger } from '@/lib/logger'
import type { OrderStatusChangedPayload } from '../../events'

/**
 * Buyer shipment email. Listens to `order.status_changed` and only fires
 * for SHIPPED. The other statuses in BUYER_ORDER_STATUS_VALUES
 * (OUT_FOR_DELIVERY, DELIVERED) are covered by the in-app push/telegram
 * channels but do not warrant an email at this phase per
 * docs/business/05-logistica-operaciones.md § Atención y soporte
 * (canal único = email + formulario; we don't spam the inbox with
 * carrier microevents).
 *
 * Tracking code lookup: the event payload doesn't carry the tracking
 * code or carrier URL today (`fulfillmentId` is optional), so we read
 * the latest shipment record for the order's vendor fulfillment.
 * If neither is available the email still goes out without the tracking
 * block — it's better to confirm "your order shipped" than to skip.
 */
export async function onBuyerOrderShipped(
  payload: OrderStatusChangedPayload,
): Promise<void> {
  if (payload.status !== 'SHIPPED') return

  const order = await db.order.findUnique({
    where: { id: payload.orderId },
    select: {
      orderNumber: true,
      customer: { select: { email: true, firstName: true } },
    },
  })

  if (!order || !order.customer?.email) {
    logger.warn('buyer_order_email.skipped_no_recipient', {
      orderId: payload.orderId,
      reason: !order ? 'order_not_found' : 'customer_has_no_email',
      kind: 'shipped',
    })
    return
  }

  // Best-effort tracking lookup. Failure here doesn't block the email.
  let trackingCode: string | undefined
  let carrierUrl: string | undefined
  if (payload.fulfillmentId) {
    const shipment = await db.shipment
      .findUnique({
        where: { fulfillmentId: payload.fulfillmentId },
        select: { trackingNumber: true, trackingUrl: true },
      })
      .catch(() => null)
    trackingCode = shipment?.trackingNumber ?? undefined
    carrierUrl = shipment?.trackingUrl ?? undefined
  }

  try {
    await sendEmail({
      to: order.customer.email,
      subject: `Tu pedido #${order.orderNumber} está en camino`,
      react: OrderShippedEmail({
        customerName: order.customer.firstName ?? 'Cliente',
        orderNumber: order.orderNumber,
        trackingCode,
        carrierUrl,
      }),
    })
    logger.info('buyer_order_email.sent', {
      orderId: payload.orderId,
      kind: 'shipped',
      to: order.customer.email,
      hasTracking: Boolean(trackingCode),
    })
  } catch (error) {
    logger.error('buyer_order_email.failed', {
      orderId: payload.orderId,
      kind: 'shipped',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
