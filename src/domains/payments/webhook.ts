import type { OrderStatus, PaymentStatus } from '@/generated/prisma/enums'

interface PaymentSnapshot {
  paymentStatus: PaymentStatus
  orderPaymentStatus: PaymentStatus
  orderStatus: OrderStatus
}

interface WebhookPaymentIntentSnapshot {
  amount?: number
  currency?: string
}

interface StoredPaymentSnapshot {
  amount: unknown
  currency: string
}

interface PaymentStatusTransitionInput {
  providerRef: string | null | undefined
  nextStatus: PaymentStatus
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

export function assertProviderRefForPaymentStatus({
  providerRef,
  nextStatus,
}: PaymentStatusTransitionInput) {
  if (nextStatus === 'SUCCEEDED' && (!providerRef || providerRef.trim().length === 0)) {
    throw new Error('providerRef requerido para marcar pago como completado')
  }
}

/**
 * Verify that the webhook amount matches the stored payment amount.
 * This prevents tampering where a client might try to pay less than the actual order total.
 *
 * Security flow:
 * 1. Client sends only IDs and quantities (no prices) to checkout
 * 2. Server calculates prices from database and creates PaymentIntent
 * 3. Server stores the calculated amount in Payment table
 * 4. Stripe processes payment and sends webhook with amount
 * 5. Webhook handler verifies: payment.amount === stored amount
 * 6. If mismatch: order is NOT confirmed, fraud audit created
 *
 * @param payment - Stored payment record with expected amount/currency
 * @param webhook - Webhook data from Stripe payment_intent event
 * @returns true if amounts match exactly, false otherwise
 */
export function doesWebhookPaymentMatchStoredPayment(
  payment: StoredPaymentSnapshot,
  webhook: WebhookPaymentIntentSnapshot
) {
  // Missing amount/currency in webhook is failure
  if (typeof webhook.amount !== 'number' || !webhook.currency) {
    return false
  }

  // Convert stored EUR to cents for comparison
  const storedAmountCents = Math.round(Number(payment.amount) * 100)

  // Exact match required (no rounding tolerance)
  if (webhook.amount !== storedAmountCents) {
    return false
  }

  // Currency must match
  return webhook.currency.toLowerCase() === payment.currency.toLowerCase()
}
