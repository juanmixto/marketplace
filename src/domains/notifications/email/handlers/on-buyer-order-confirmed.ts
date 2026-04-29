import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { OrderConfirmationEmail } from '@/emails/OrderConfirmation'
import { logger } from '@/lib/logger'
import type { OrderBuyerConfirmedPayload } from '../../events'

/**
 * Buyer confirmation email — fires once per order after payment is
 * confirmed. CF-1 step 8 (docs/product/02-flujos-criticos.md): "Email
 * de confirmación al instante." Source for missed audit finding: #933.
 *
 * The handler trusts the dispatcher: `emit` is called from exactly two
 * sites (mock confirm-order use case + Stripe webhook handlePaymentSucceeded),
 * each of which fires once per order. There is no in-handler dedupe; if
 * a future emit site is added, dedupe responsibility moves there.
 *
 * `sendEmail` is a no-op when RESEND_API_KEY is unset, so dev/local
 * environments remain quiet without throwing.
 */
export async function onBuyerOrderConfirmed(
  payload: OrderBuyerConfirmedPayload,
): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: payload.orderId },
    select: {
      orderNumber: true,
      placedAt: true,
      subtotal: true,
      shippingCost: true,
      taxAmount: true,
      grandTotal: true,
      customer: { select: { email: true, firstName: true } },
      lines: {
        select: {
          quantity: true,
          unitPrice: true,
          product: { select: { name: true } },
          productSnapshot: true,
        },
      },
    },
  })

  if (!order || !order.customer?.email) {
    logger.warn('buyer_order_email.skipped_no_recipient', {
      orderId: payload.orderId,
      reason: !order ? 'order_not_found' : 'customer_has_no_email',
    })
    return
  }

  const items = order.lines.map(line => {
    const name =
      line.product?.name ??
      (line.productSnapshot as { name?: string } | null)?.name ??
      'Producto'
    return {
      name,
      quantity: line.quantity,
      price: Number(line.unitPrice),
    }
  })

  try {
    await sendEmail({
      to: order.customer.email,
      subject: `Confirmación de tu pedido #${order.orderNumber}`,
      react: OrderConfirmationEmail({
        orderNumber: order.orderNumber,
        customerName: order.customer.firstName ?? 'Cliente',
        orderDate: new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(
          order.placedAt,
        ),
        items,
        subtotal: Number(order.subtotal),
        shipping: Number(order.shippingCost),
        tax: Number(order.taxAmount),
        total: Number(order.grandTotal),
      }),
    })
    logger.info('buyer_order_email.sent', {
      orderId: payload.orderId,
      kind: 'confirmation',
      to: order.customer.email,
    })
  } catch (error) {
    logger.error('buyer_order_email.failed', {
      orderId: payload.orderId,
      kind: 'confirmation',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
