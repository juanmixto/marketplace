import {
  paymentConfirmedEventPayloadSchema,
  paymentFailedEventPayloadSchema,
  paymentMismatchEventPayloadSchema,
  type PaymentConfirmedEventPayload,
  type PaymentFailedEventPayload,
  type PaymentMismatchEventPayload,
} from '@/types/order'

export type {
  PaymentConfirmedEventPayload,
  PaymentFailedEventPayload,
  PaymentMismatchEventPayload,
} from '@/types/order'

export function createPaymentConfirmedEventPayload(payload: PaymentConfirmedEventPayload) {
  return paymentConfirmedEventPayloadSchema.parse(payload)
}

export function createPaymentFailedEventPayload(payload: PaymentFailedEventPayload) {
  return paymentFailedEventPayloadSchema.parse(payload)
}

export function createPaymentMismatchEventPayload(payload: PaymentMismatchEventPayload) {
  return paymentMismatchEventPayloadSchema.parse(payload)
}
