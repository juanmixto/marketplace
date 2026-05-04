import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { revalidateCatalogExperience, safeRevalidatePath } from '@/lib/revalidate'
import { emit as emitNotification } from '@/domains/notifications'
import { createPaymentMismatchEventPayload } from './order-event-payload'
import type { StockLowCandidate } from './inventory'
import type { NotificationEventMap } from '@/domains/notifications'

export type OrderSideEffects = {
  shouldRevalidateCatalogExperience: boolean
  revalidationPaths: string[]
  notifications: Array<
    | { event: 'order.created'; payload: NotificationEventMap['order.created'] }
    | { event: 'stock.low'; payload: NotificationEventMap['stock.low'] }
    | { event: 'order.buyer_confirmed'; payload: NotificationEventMap['order.buyer_confirmed'] }
  >
  events: Array<{
    orderId: string
    type: Prisma.OrderEventCreateArgs['data']['type']
    payload: Prisma.OrderEventCreateArgs['data']['payload']
  }>
}

type RecordCreatedOrderSideEffectsInput = {
  kind: 'order.created'
  orderId: string
  customerName: string
  customerUserId?: string
  vendorIds: string[]
  fulfillmentByVendor: Map<string, string | undefined>
  lines: Array<{
    vendorId: string
    unitPrice: number
    quantity: number
  }>
  productSlugs: string[]
  vendorSlugs: string[]
  stockLowCandidates: StockLowCandidate[]
  /**
   * #1154 H-4: when the order's grandTotal is 0, no Stripe webhook will
   * ever fire to deliver `order.buyer_confirmed`. The createOrder flow
   * itself signals confirmation by routing it through the side-effects
   * outbox alongside the per-vendor `order.created` notifications.
   */
  isFreeOrder?: boolean
}

type RecordOrderCreatedSideEffectsInput = Omit<RecordCreatedOrderSideEffectsInput, 'kind'>

type RecordPaymentMismatchSideEffectsInput = {
  kind: 'payment.mismatch'
  orderId: string
  providerRef: string
  amount: number
  expectedAmount: number
  expectedCurrency: string
}

type RecordPaymentMismatchSideEffectsRecordInput = Omit<RecordPaymentMismatchSideEffectsInput, 'kind'>

type RecordSideEffectsInput =
  | RecordCreatedOrderSideEffectsInput
  | { kind: 'order.confirmed'; orderId: string }
  | { kind: 'payment.intent.failed'; orderId: string; paymentError: unknown }
  | RecordPaymentMismatchSideEffectsInput

export function recordOrderCreatedSideEffects(input: RecordOrderCreatedSideEffectsInput): OrderSideEffects {
  const notifications: OrderSideEffects['notifications'] = []
  for (const vendorId of input.vendorIds) {
    const vendorTotalCents = Math.round(
      input.lines
        .filter(line => line.vendorId === vendorId)
        .reduce((sum, line) => sum + line.unitPrice * line.quantity, 0) * 100,
    )
    notifications.push({
      event: 'order.created',
      payload: {
        orderId: input.orderId,
        vendorId,
        fulfillmentId: input.fulfillmentByVendor.get(vendorId),
        customerName: input.customerName,
        totalCents: vendorTotalCents,
        currency: 'EUR',
      },
    })
  }
  notifications.push(
    ...input.stockLowCandidates.map(candidate => ({
      event: 'stock.low' as const,
      payload: {
        productId: candidate.productId,
        vendorId: candidate.vendorId,
        productName: candidate.productName,
        remainingStock: candidate.remainingStock,
      },
    })),
  )

  // #1154 H-4: free orders skip Stripe entirely — emit the buyer
  // confirmation through the same outbox so the email handler runs
  // exactly once. Real-paid orders get this from the Stripe webhook.
  if (input.isFreeOrder && input.customerUserId) {
    notifications.push({
      event: 'order.buyer_confirmed',
      payload: {
        orderId: input.orderId,
        customerUserId: input.customerUserId,
      },
    })
  }

  return {
    shouldRevalidateCatalogExperience: true,
    revalidationPaths: [
      ...input.productSlugs.map(slug => `/productos/${slug}`),
      ...input.vendorSlugs.map(slug => `/productores/${slug}`),
      '/buscar',
      '/carrito',
    ],
    notifications,
    events: [],
  }
}

export function recordOrderConfirmedSideEffects(orderId: string): OrderSideEffects {
  return {
    shouldRevalidateCatalogExperience: true,
    revalidationPaths: [`/cuenta/pedidos`, `/cuenta/pedidos/${orderId}`, '/carrito'],
    notifications: [],
    events: [],
  }
}

export function recordPaymentIntentFailureSideEffects(
  orderId: string,
  paymentError: unknown
): OrderSideEffects {
  return {
    shouldRevalidateCatalogExperience: false,
    revalidationPaths: [],
    notifications: [],
    events: [
      {
        orderId,
        type: 'PAYMENT_INTENT_CREATION_FAILED',
        payload: {
          recordedAt: new Date().toISOString(),
          error: paymentError instanceof Error ? paymentError.message : String(paymentError),
        },
      },
    ],
  }
}

export function recordPaymentMismatchSideEffects(input: RecordPaymentMismatchSideEffectsRecordInput): OrderSideEffects {
  return {
    shouldRevalidateCatalogExperience: false,
    revalidationPaths: [],
    notifications: [],
    events: [
      {
        orderId: input.orderId,
        type: 'PAYMENT_MISMATCH',
        payload: createPaymentMismatchEventPayload({
          providerRef: input.providerRef,
          amount: input.amount,
          expectedAmount: input.expectedAmount,
          expectedCurrency: input.expectedCurrency,
        }),
      },
    ],
  }
}

/**
 * Back-compat aggregate for callers that still want a single plan builder.
 * New code should prefer the specific `record*SideEffects` helpers.
 */
export function recordSideEffects(input: RecordSideEffectsInput): OrderSideEffects {
  switch (input.kind) {
    case 'order.created':
      return recordOrderCreatedSideEffects(input)
    case 'order.confirmed':
      return recordOrderConfirmedSideEffects(input.orderId)
    case 'payment.intent.failed':
      return recordPaymentIntentFailureSideEffects(input.orderId, input.paymentError)
    case 'payment.mismatch':
      return recordPaymentMismatchSideEffects(input)
  }
}

export async function dispatchSideEffects(
  sideEffects: OrderSideEffects,
  phase: 'revalidations' | 'notifications' | 'events' | 'all' = 'all'
): Promise<void> {
  const shouldRunRevalidations = phase === 'all' || phase === 'revalidations'
  const shouldRunNotifications = phase === 'all' || phase === 'notifications'
  const shouldRunEvents = phase === 'all' || phase === 'events'

  if (shouldRunRevalidations) {
    if (sideEffects.shouldRevalidateCatalogExperience) {
      revalidateCatalogExperience()
    }
    for (const path of sideEffects.revalidationPaths) {
      safeRevalidatePath(path)
    }
  }

  if (shouldRunNotifications) {
    for (const notification of sideEffects.notifications) {
      emitNotification(notification.event, notification.payload)
    }
  }

  if (shouldRunEvents) {
    for (const event of sideEffects.events) {
      await db.orderEvent.create({
        data: {
          orderId: event.orderId,
          type: event.type,
          payload: event.payload,
        },
      })
    }
  }
}
