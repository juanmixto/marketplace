import type { OrderStatus, PaymentStatus } from '@/generated/prisma/enums'

interface PaymentSnapshot {
  paymentStatus: PaymentStatus
  orderPaymentStatus: PaymentStatus
  orderStatus: OrderStatus
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
