import { db } from '@/lib/db'
import type {
  OrderDeliveredPayload,
  LabelFailedPayload,
  IncidentOpenedPayload,
  ReviewReceivedPayload,
  PayoutPaidPayload,
  StockLowPayload,
} from '../../events'
import { sendToUser } from '../service'
import {
  orderDeliveredTemplate,
  labelFailedTemplate,
  incidentOpenedTemplate,
  reviewReceivedTemplate,
  payoutPaidTemplate,
  stockLowTemplate,
} from '../templates'
import { resolveOrderView } from './order-view'

async function resolveVendorUserId(vendorId: string): Promise<string | null> {
  const vendor = await db.vendor.findUnique({
    where: { id: vendorId },
    select: { userId: true },
  })
  return vendor?.userId ?? null
}

export async function onOrderDelivered(payload: OrderDeliveredPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) return
  const view = await resolveOrderView(payload.orderId, payload.vendorId)
  await sendToUser(userId, 'ORDER_DELIVERED', orderDeliveredTemplate(payload, view), {
    payloadRef: `order:${payload.orderId}`,
  })
}

export async function onLabelFailed(payload: LabelFailedPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) return
  const view = await resolveOrderView(payload.orderId, payload.vendorId)
  await sendToUser(userId, 'LABEL_FAILED', labelFailedTemplate(payload, view), {
    payloadRef: `order:${payload.orderId}`,
  })
}

export async function onIncidentOpened(payload: IncidentOpenedPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) return
  const view = await resolveOrderView(payload.orderId, payload.vendorId)
  await sendToUser(userId, 'INCIDENT_OPENED', incidentOpenedTemplate(payload, view), {
    payloadRef: `incident:${payload.incidentId}`,
  })
}

export async function onReviewReceived(payload: ReviewReceivedPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) return
  await sendToUser(userId, 'REVIEW_RECEIVED', reviewReceivedTemplate(payload), {
    payloadRef: `review:${payload.reviewId}`,
  })
}

export async function onPayoutPaid(payload: PayoutPaidPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) return
  await sendToUser(userId, 'PAYOUT_PAID', payoutPaidTemplate(payload), {
    payloadRef: `settlement:${payload.settlementId}`,
  })
}

export async function onStockLow(payload: StockLowPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) return
  await sendToUser(userId, 'STOCK_LOW', stockLowTemplate(payload), {
    payloadRef: `product:${payload.productId}`,
  })
}
