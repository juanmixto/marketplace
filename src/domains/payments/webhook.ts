import type { OrderStatus, PaymentStatus } from '@/generated/prisma/enums'

interface PaymentSnapshot {
  paymentStatus: PaymentStatus
  orderPaymentStatus: PaymentStatus
  orderStatus: OrderStatus
}

/**
 * Returns true if the mock webhook path is safe to use.
 * In production, mock processing must be blocked to prevent spoofed events.
 */
export function isMockWebhookAllowed(paymentProvider: string, nodeEnv: string): boolean {
  if (paymentProvider !== 'mock') return false
  return nodeEnv !== 'production'
}

/**
 * Extracts a stable idempotency key from a Stripe event id.
 * Returns null for mock events without an id (allow processing).
 */
export function getWebhookIdempotencyKey(eventId: string | undefined): string | null {
  return eventId ?? null
}

export function shouldApplyPaymentSucceeded(snapshot: PaymentSnapshot) {
  return !(
    snapshot.paymentStatus === 'SUCCEEDED' &&
    snapshot.orderPaymentStatus === 'SUCCEEDED' &&
    snapshot.orderStatus === 'PAYMENT_CONFIRMED'
  )
}

export function shouldApplyPaymentFailed(snapshot: PaymentSnapshot) {
  if (snapshot.paymentStatus === 'SUCCEEDED' || snapshot.orderPaymentStatus === 'SUCCEEDED') {
    return false
  }

  return !(
    snapshot.paymentStatus === 'FAILED' &&
    snapshot.orderPaymentStatus === 'FAILED'
  )
}
