import { z } from 'zod'

export const NOTIFICATION_EVENTS = {
  ORDER_CREATED: 'order.created',
  ORDER_PENDING: 'order.pending',
  MESSAGE_RECEIVED: 'message.received',
} as const

export type NotificationEventName =
  (typeof NOTIFICATION_EVENTS)[keyof typeof NOTIFICATION_EVENTS]

export const orderCreatedPayloadSchema = z.object({
  orderId: z.string().min(1),
  vendorId: z.string().min(1),
  customerName: z.string().min(1).max(120),
  totalCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
})
export type OrderCreatedPayload = z.infer<typeof orderCreatedPayloadSchema>

export const orderPendingPayloadSchema = z.object({
  orderId: z.string().min(1),
  vendorId: z.string().min(1),
  reason: z.enum(['NEEDS_CONFIRMATION', 'NEEDS_SHIPMENT']),
})
export type OrderPendingPayload = z.infer<typeof orderPendingPayloadSchema>

export const messageReceivedPayloadSchema = z.object({
  conversationId: z.string().min(1),
  vendorId: z.string().min(1),
  fromUserName: z.string().min(1).max(120),
  preview: z.string().max(200),
})
export type MessageReceivedPayload = z.infer<typeof messageReceivedPayloadSchema>

export type NotificationEventMap = {
  'order.created': OrderCreatedPayload
  'order.pending': OrderPendingPayload
  'message.received': MessageReceivedPayload
}

export const notificationEventPayloadSchemas = {
  'order.created': orderCreatedPayloadSchema,
  'order.pending': orderPendingPayloadSchema,
  'message.received': messageReceivedPayloadSchema,
} as const
