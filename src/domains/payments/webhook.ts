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

export function doesWebhookPaymentMatchStoredPayment(
  payment: StoredPaymentSnapshot,
  webhook: WebhookPaymentIntentSnapshot
) {
  if (typeof webhook.amount !== 'number' || !webhook.currency) {
    return false
  }

  const storedAmountCents = Math.round(Number(payment.amount) * 100)
  if (webhook.amount !== storedAmountCents) {
    return false
  }

  return webhook.currency.toLowerCase() === payment.currency.toLowerCase()
}
