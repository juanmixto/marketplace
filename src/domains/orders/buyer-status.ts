import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '@/lib/constants'

export type BuyerBadgeVariant = 'green' | 'amber' | 'red' | 'blue' | 'default'

interface BuyerStatus {
  label: string
  variant: BuyerBadgeVariant
}

/**
 * Collapse the (Order.status, Payment.status) pair into the single label that
 * answers "what is the next thing the buyer should know?".
 *
 * Rules:
 * - If payment is not yet succeeded, payment dominates — the buyer cares most
 *   about the open loop (pending / failed / refunded).
 * - Otherwise show the order status, which describes fulfilment progress.
 *
 * Admin views deliberately keep both badges (see /admin/pedidos) — they need
 * the desaggregated state for operational decisions. This helper is for
 * buyer-facing surfaces only.
 */
export function getBuyerOrderStatus(order: { status: string; paymentStatus: string }): BuyerStatus {
  const { status, paymentStatus } = order

  if (paymentStatus !== 'SUCCEEDED') {
    const variant: BuyerBadgeVariant =
      paymentStatus === 'FAILED' ? 'red'
      : paymentStatus === 'PENDING' ? 'amber'
      : paymentStatus === 'REFUNDED' || paymentStatus === 'PARTIALLY_REFUNDED' ? 'default'
      : 'default'
    return {
      label: PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus,
      variant,
    }
  }

  const variant: BuyerBadgeVariant =
    status === 'DELIVERED' ? 'green'
    : status === 'CANCELLED' ? 'red'
    : status === 'REFUNDED' ? 'default'
    : status === 'PROCESSING' || status === 'PARTIALLY_SHIPPED' || status === 'SHIPPED' ? 'amber'
    : 'blue'
  return {
    label: ORDER_STATUS_LABELS[status] ?? status,
    variant,
  }
}
