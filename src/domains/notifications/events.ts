import { z } from 'zod'

export const NOTIFICATION_EVENTS = {
  ORDER_CREATED: 'order.created',
  ORDER_PENDING: 'order.pending',
  MESSAGE_RECEIVED: 'message.received',
  ORDER_DELIVERED: 'order.delivered',
  LABEL_FAILED: 'label.failed',
  INCIDENT_OPENED: 'incident.opened',
  REVIEW_RECEIVED: 'review.received',
  PAYOUT_PAID: 'payout.paid',
  STOCK_LOW: 'stock.low',
  ORDER_STATUS_CHANGED: 'order.status_changed',
  ORDER_BUYER_CONFIRMED: 'order.buyer_confirmed',
  FAVORITE_BACK_IN_STOCK: 'favorite.back_in_stock',
  FAVORITE_PRICE_DROP: 'favorite.price_drop',
  VENDOR_APPLICATION_APPROVED: 'vendor.application.approved',
  VENDOR_APPLICATION_REJECTED: 'vendor.application.rejected',
} as const

export type NotificationEventName =
  (typeof NOTIFICATION_EVENTS)[keyof typeof NOTIFICATION_EVENTS]

export const orderCreatedPayloadSchema = z.object({
  orderId: z.string().min(1),
  vendorId: z.string().min(1),
  fulfillmentId: z.string().min(1).optional(),
  customerName: z.string().min(1).max(120),
  totalCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
})
export type OrderCreatedPayload = z.infer<typeof orderCreatedPayloadSchema>

export const orderPendingPayloadSchema = z.object({
  orderId: z.string().min(1),
  vendorId: z.string().min(1),
  fulfillmentId: z.string().min(1).optional(),
  reason: z.enum(['NEEDS_CONFIRMATION', 'NEEDS_LABEL', 'NEEDS_SHIPMENT']),
})
export type OrderPendingPayload = z.infer<typeof orderPendingPayloadSchema>

export const messageReceivedPayloadSchema = z.object({
  conversationId: z.string().min(1),
  vendorId: z.string().min(1),
  fromUserName: z.string().min(1).max(120),
  preview: z.string().max(200),
})
export type MessageReceivedPayload = z.infer<typeof messageReceivedPayloadSchema>

export const orderDeliveredPayloadSchema = z.object({
  orderId: z.string().min(1),
  vendorId: z.string().min(1),
  fulfillmentId: z.string().min(1),
})
export type OrderDeliveredPayload = z.infer<typeof orderDeliveredPayloadSchema>

export const labelFailedPayloadSchema = z.object({
  orderId: z.string().min(1),
  vendorId: z.string().min(1),
  fulfillmentId: z.string().min(1),
  errorMessage: z.string().min(1).max(500),
})
export type LabelFailedPayload = z.infer<typeof labelFailedPayloadSchema>

export const incidentOpenedPayloadSchema = z.object({
  incidentId: z.string().min(1),
  orderId: z.string().min(1),
  vendorId: z.string().min(1),
  type: z.string().min(1).max(60),
})
export type IncidentOpenedPayload = z.infer<typeof incidentOpenedPayloadSchema>

export const reviewReceivedPayloadSchema = z.object({
  reviewId: z.string().min(1),
  vendorId: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string().min(1).max(160),
  rating: z.number().int().min(1).max(5),
})
export type ReviewReceivedPayload = z.infer<typeof reviewReceivedPayloadSchema>

export const payoutPaidPayloadSchema = z.object({
  settlementId: z.string().min(1),
  vendorId: z.string().min(1),
  netPayableCents: z.number().int(),
  currency: z.string().length(3),
  periodLabel: z.string().min(1).max(80),
})
export type PayoutPaidPayload = z.infer<typeof payoutPaidPayloadSchema>

export const stockLowPayloadSchema = z.object({
  productId: z.string().min(1),
  vendorId: z.string().min(1),
  productName: z.string().min(1).max(160),
  remainingStock: z.number().int().nonnegative(),
})
export type StockLowPayload = z.infer<typeof stockLowPayloadSchema>

export const BUYER_ORDER_STATUS_VALUES = [
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const
export const orderStatusChangedPayloadSchema = z.object({
  orderId: z.string().min(1),
  customerUserId: z.string().min(1),
  fulfillmentId: z.string().min(1).optional(),
  status: z.enum(BUYER_ORDER_STATUS_VALUES),
  orderNumber: z.string().min(1).max(40).optional(),
  vendorName: z.string().min(1).max(120).optional(),
})
export type OrderStatusChangedPayload = z.infer<typeof orderStatusChangedPayloadSchema>

// Buyer-facing confirmation, emitted once per order from the order-confirmed
// side-effects path. Unlike `order.created` (which fires once per vendor
// fulfillment in a multi-vendor order), this fires exactly once per order
// — the buyer should receive a single confirmation email summarizing the
// whole purchase. CF-1 step 8 (docs/product/02-flujos-criticos.md).
export const orderBuyerConfirmedPayloadSchema = z.object({
  orderId: z.string().min(1),
  customerUserId: z.string().min(1),
})
export type OrderBuyerConfirmedPayload = z.infer<typeof orderBuyerConfirmedPayloadSchema>

export const favoriteBackInStockPayloadSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1).max(160),
  productSlug: z.string().min(1).max(200).optional(),
  vendorName: z.string().min(1).max(120).optional(),
})
export type FavoriteBackInStockPayload = z.infer<typeof favoriteBackInStockPayloadSchema>

export const favoritePriceDropPayloadSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1).max(160),
  productSlug: z.string().min(1).max(200).optional(),
  vendorName: z.string().min(1).max(120).optional(),
  oldPriceCents: z.number().int().positive(),
  newPriceCents: z.number().int().positive(),
  currency: z.string().length(3),
})
export type FavoritePriceDropPayload = z.infer<typeof favoritePriceDropPayloadSchema>

export const vendorApplicationApprovedPayloadSchema = z.object({
  userId: z.string().min(1),
  vendorId: z.string().min(1),
  displayName: z.string().min(1).max(160),
  vendorSlug: z.string().min(1).max(200),
})
export type VendorApplicationApprovedPayload = z.infer<typeof vendorApplicationApprovedPayloadSchema>

export const vendorApplicationRejectedPayloadSchema = z.object({
  userId: z.string().min(1),
  vendorId: z.string().min(1),
  displayName: z.string().min(1).max(160),
})
export type VendorApplicationRejectedPayload = z.infer<typeof vendorApplicationRejectedPayloadSchema>

export type NotificationEventMap = {
  'order.created': OrderCreatedPayload
  'order.pending': OrderPendingPayload
  'message.received': MessageReceivedPayload
  'order.delivered': OrderDeliveredPayload
  'label.failed': LabelFailedPayload
  'incident.opened': IncidentOpenedPayload
  'review.received': ReviewReceivedPayload
  'payout.paid': PayoutPaidPayload
  'stock.low': StockLowPayload
  'order.status_changed': OrderStatusChangedPayload
  'order.buyer_confirmed': OrderBuyerConfirmedPayload
  'favorite.back_in_stock': FavoriteBackInStockPayload
  'favorite.price_drop': FavoritePriceDropPayload
  'vendor.application.approved': VendorApplicationApprovedPayload
  'vendor.application.rejected': VendorApplicationRejectedPayload
}

export const notificationEventPayloadSchemas = {
  'order.created': orderCreatedPayloadSchema,
  'order.pending': orderPendingPayloadSchema,
  'message.received': messageReceivedPayloadSchema,
  'order.delivered': orderDeliveredPayloadSchema,
  'label.failed': labelFailedPayloadSchema,
  'incident.opened': incidentOpenedPayloadSchema,
  'review.received': reviewReceivedPayloadSchema,
  'payout.paid': payoutPaidPayloadSchema,
  'stock.low': stockLowPayloadSchema,
  'order.status_changed': orderStatusChangedPayloadSchema,
  'order.buyer_confirmed': orderBuyerConfirmedPayloadSchema,
  'favorite.back_in_stock': favoriteBackInStockPayloadSchema,
  'favorite.price_drop': favoritePriceDropPayloadSchema,
  'vendor.application.approved': vendorApplicationApprovedPayloadSchema,
  'vendor.application.rejected': vendorApplicationRejectedPayloadSchema,
} as const
