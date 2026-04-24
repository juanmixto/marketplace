import { db } from '@/lib/db'
import type {
  OrderDeliveredPayload,
  LabelFailedPayload,
  IncidentOpenedPayload,
  ReviewReceivedPayload,
  PayoutPaidPayload,
  StockLowPayload,
} from '../../events'
import { sendWebPushToUser } from '../service'
import {
  orderDeliveredPush,
  labelFailedPush,
  incidentOpenedPush,
  reviewReceivedPush,
  payoutPaidPush,
  stockLowPush,
} from '../templates'
import { resolveOrderPushView, resolveVendorFirstName, resolveVendorUserId } from './shared'

export async function onOrderDelivered(payload: OrderDeliveredPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) return
  const view = await resolveOrderPushView(payload.orderId, payload.vendorId)
  await sendWebPushToUser(userId, 'ORDER_DELIVERED', orderDeliveredPush(payload, view), {
    payloadRef: `order:${payload.orderId}`,
  })
}

export async function onLabelFailed(payload: LabelFailedPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) return
  const view = await resolveOrderPushView(payload.orderId, payload.vendorId)
  await sendWebPushToUser(userId, 'LABEL_FAILED', labelFailedPush(payload, view), {
    payloadRef: `order:${payload.orderId}`,
  })
}

export async function onIncidentOpened(payload: IncidentOpenedPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) return
  const [orderView, incident] = await Promise.all([
    resolveOrderPushView(payload.orderId, payload.vendorId),
    db.incident.findUnique({
      where: { id: payload.incidentId },
      select: { description: true },
    }),
  ])
  const view = {
    ...(orderView ?? {}),
    descriptionPreview: incident?.description ?? undefined,
  }
  await sendWebPushToUser(userId, 'INCIDENT_OPENED', incidentOpenedPush(payload, view), {
    payloadRef: `incident:${payload.incidentId}`,
  })
}

export async function onReviewReceived(payload: ReviewReceivedPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) return
  const [vendorFirstName, review] = await Promise.all([
    resolveVendorFirstName(payload.vendorId),
    db.review.findUnique({
      where: { id: payload.reviewId },
      select: {
        body: true,
        customer: { select: { firstName: true } },
      },
    }),
  ])
  await sendWebPushToUser(
    userId,
    'REVIEW_RECEIVED',
    reviewReceivedPush(payload, {
      vendorFirstName,
      reviewerFirstName: review?.customer?.firstName ?? undefined,
      commentPreview: review?.body ?? undefined,
    }),
    { payloadRef: `review:${payload.reviewId}` },
  )
}

export async function onPayoutPaid(payload: PayoutPaidPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) return
  const [vendorFirstName, settlement] = await Promise.all([
    resolveVendorFirstName(payload.vendorId),
    db.settlement.findUnique({
      where: { id: payload.settlementId },
      select: { periodFrom: true, periodTo: true, vendorId: true },
    }),
  ])
  let orderCount: number | undefined
  if (settlement) {
    orderCount = await db.orderLine.count({
      where: {
        vendorId: settlement.vendorId,
        createdAt: { gte: settlement.periodFrom, lte: settlement.periodTo },
      },
    })
  }
  await sendWebPushToUser(
    userId,
    'PAYOUT_PAID',
    payoutPaidPush(payload, { vendorFirstName, orderCount }),
    { payloadRef: `settlement:${payload.settlementId}` },
  )
}

export async function onStockLow(payload: StockLowPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) return
  const vendorFirstName = await resolveVendorFirstName(payload.vendorId)
  await sendWebPushToUser(
    userId,
    'STOCK_LOW',
    stockLowPush(payload, { vendorFirstName }),
    { payloadRef: `product:${payload.productId}` },
  )
}
