import { z } from 'zod'

export const notificationChannelSchema = z.enum(['TELEGRAM', 'WEB_PUSH'])
export type NotificationChannel = z.infer<typeof notificationChannelSchema>

export const notificationEventTypeSchema = z.enum([
  'ORDER_CREATED',
  'ORDER_PENDING',
  'MESSAGE_RECEIVED',
  'ORDER_DELIVERED',
  'LABEL_FAILED',
  'INCIDENT_OPENED',
  'REVIEW_RECEIVED',
  'PAYOUT_PAID',
  'STOCK_LOW',
  'BUYER_ORDER_STATUS',
  'BUYER_FAVORITE_RESTOCK',
  'BUYER_FAVORITE_PRICE_DROP',
  'BUYER_VENDOR_APPLICATION_APPROVED',
  'BUYER_VENDOR_APPLICATION_REJECTED',
])
export type NotificationEventType = z.infer<typeof notificationEventTypeSchema>

export const notificationDeliveryStatusSchema = z.enum(['SENT', 'FAILED', 'SKIPPED'])
export type NotificationDeliveryStatus = z.infer<typeof notificationDeliveryStatusSchema>
