import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { ReviewRequestEmail } from '@/emails/ReviewRequest'
import { countPendingReviewsInOrder } from './pending-policy'

export const REVIEW_REQUEST_EMAIL_EVENT = 'REVIEW_REQUEST_EMAIL_SENT'

export interface SendReviewRequestResult {
  sent: boolean
  reason?: 'order-not-found' | 'not-delivered' | 'already-sent' | 'no-pending-reviews' | 'no-email'
}

/**
 * Sends the post-delivery "leave a review" email to the customer for a single order.
 *
 * Guarantees at most one email per order via an `OrderEvent` row of type
 * `REVIEW_REQUEST_EMAIL_SENT`. Callers can pass `force: true` to bypass the
 * idempotency guard (useful for retries or admin tools).
 *
 * This helper is intentionally side-effect-complete: it loads the order, checks
 * all guards, renders the email, sends it, and records the event. It is safe to
 * call without wrapping in a transaction.
 */
export async function sendReviewRequestEmail(
  orderId: string,
  opts?: { force?: boolean }
): Promise<SendReviewRequestResult> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      customer: {
        select: { email: true, firstName: true, lastName: true },
      },
      lines: {
        select: {
          productId: true,
          product: {
            select: {
              name: true,
              vendor: { select: { displayName: true } },
            },
          },
        },
      },
      reviews: { select: { productId: true } },
      events: {
        where: { type: REVIEW_REQUEST_EMAIL_EVENT },
        select: { id: true },
        take: 1,
      },
    },
  })

  if (!order) return { sent: false, reason: 'order-not-found' }
  if (order.status !== 'DELIVERED') return { sent: false, reason: 'not-delivered' }
  if (!opts?.force && order.events.length > 0) {
    return { sent: false, reason: 'already-sent' }
  }
  if (!order.customer.email) return { sent: false, reason: 'no-email' }

  const pendingCount = countPendingReviewsInOrder({
    lines: order.lines.map(l => ({ productId: l.productId })),
    reviews: order.reviews,
  })
  if (pendingCount === 0) return { sent: false, reason: 'no-pending-reviews' }

  // Deduplicate products by name for the email body and skip already-reviewed ones
  const reviewed = new Set(order.reviews.map(r => r.productId))
  const seen = new Set<string>()
  const products: Array<{ name: string; vendorName: string }> = []
  for (const line of order.lines) {
    if (reviewed.has(line.productId)) continue
    if (seen.has(line.productId)) continue
    seen.add(line.productId)
    products.push({
      name: line.product.name,
      vendorName: line.product.vendor.displayName,
    })
  }

  const customerName = [order.customer.firstName, order.customer.lastName]
    .filter(Boolean)
    .join(' ')
    .trim() || order.customer.email

  await sendEmail({
    to: order.customer.email,
    subject: `¿Qué te ha parecido tu pedido #${order.orderNumber}?`,
    react: ReviewRequestEmail({
      customerName,
      orderNumber: order.orderNumber,
      orderId: order.id,
      products,
    }),
  })

  await db.orderEvent.create({
    data: {
      orderId: order.id,
      type: REVIEW_REQUEST_EMAIL_EVENT,
      payload: { pendingAtSend: pendingCount },
    },
  })

  return { sent: true }
}
