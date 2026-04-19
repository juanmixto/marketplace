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
import { resolveOrderView, resolveVendorFirstName } from './order-view'

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
  const [orderView, incident] = await Promise.all([
    resolveOrderView(payload.orderId, payload.vendorId),
    db.incident.findUnique({
      where: { id: payload.incidentId },
      select: { description: true },
    }),
  ])
  const view = {
    ...(orderView ?? {}),
    descriptionPreview: incident?.description ?? undefined,
  }
  await sendToUser(userId, 'INCIDENT_OPENED', incidentOpenedTemplate(payload, view), {
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
  await sendToUser(
    userId,
    'REVIEW_RECEIVED',
    reviewReceivedTemplate(payload, {
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
  await sendToUser(
    userId,
    'PAYOUT_PAID',
    payoutPaidTemplate(payload, { vendorFirstName, orderCount }),
    { payloadRef: `settlement:${payload.settlementId}` },
  )
}

export async function onStockLow(payload: StockLowPayload): Promise<void> {
  const userId = await resolveVendorUserId(payload.vendorId)
  if (!userId) return
  const vendorFirstName = await resolveVendorFirstName(payload.vendorId)
  await sendToUser(
    userId,
    'STOCK_LOW',
    stockLowTemplate(payload, { vendorFirstName }),
    { payloadRef: `product:${payload.productId}` },
  )
}
