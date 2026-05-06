import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { trackServer } from '@/lib/analytics.server'
import { refundPaymentIntent } from '@/domains/payments/provider'
import { assertOrderTransition, canTransitionOrder } from '@/domains/orders/state-machine'

export type CancelOrderActor =
  | { type: 'ADMIN'; id: string }
  | { type: 'BUYER'; id: string }

export interface CancelOrderArgs {
  orderId: string
  reason: string
  actor: CancelOrderActor
}

export type CancelOrderResult =
  | { refundIssued: false; alreadyTerminal?: 'CANCELLED' | 'REFUNDED' }
  | { refundIssued: true; refundAmount: number }

const TX_OPTIONS = { timeout: 15_000, maxWait: 5_000 } as const

/**
 * Cancel an Order with the refund policy described in #1343:
 *
 * - Already CANCELLED / REFUNDED: idempotent no-op.
 * - Payment PENDING (Order PLACED, no Stripe webhook yet): cancel
 *   the Order, no Refund row, no Stripe call.
 * - Payment SUCCEEDED at PAYMENT_CONFIRMED / PROCESSING: full refund
 *   via Stripe; Order → REFUNDED; Refund row persisted.
 * - SHIPPED or beyond: throws `cancellation_requires_incident`.
 * - Buyer actor: only allowed at PLACED / PAYMENT_CONFIRMED, otherwise
 *   throws (admin-only beyond that).
 *
 * The Stripe call sits OUTSIDE the Prisma transaction (an external API
 * call inside a tx is forbidden by docs/db-conventions.md). We mirror
 * the incident-resolve flow: call Stripe first; if it throws, no local
 * state has changed. If it succeeds we open a short tx that flips
 * Order/Payment + writes the Refund row.
 */
export async function cancelOrderWithRefundPolicy(
  args: CancelOrderArgs,
): Promise<CancelOrderResult> {
  const { orderId, reason, actor } = args

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      customerId: true,
      lines: {
        select: {
          productId: true,
          variantId: true,
          vendorId: true,
          quantity: true,
          product: { select: { trackStock: true } },
        },
      },
      fulfillments: { select: { vendorId: true, status: true } },
      payments: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          amount: true,
          providerRef: true,
        },
      },
    },
  })
  if (!order) throw new Error('order_not_found')
  const orderLines = order.lines

  // Idempotent no-op for terminal states.
  if (order.status === 'CANCELLED') {
    return { refundIssued: false, alreadyTerminal: 'CANCELLED' }
  }
  if (order.status === 'REFUNDED') {
    return { refundIssued: false, alreadyTerminal: 'REFUNDED' }
  }

  // SHIPPED / DELIVERED / PARTIALLY_SHIPPED: cancellation requires the
  // incident flow (which can issue a partial refund + handle the
  // physical exception). PARTIALLY_SHIPPED is included because at least
  // one parcel is already on its way — admin must triage manually.
  if (
    order.status === 'SHIPPED' ||
    order.status === 'DELIVERED' ||
    order.status === 'PARTIALLY_SHIPPED'
  ) {
    throw new Error('cancellation_requires_incident')
  }

  // Buyer scope: must own the order AND be in a pre-fulfillment state.
  if (actor.type === 'BUYER') {
    if (order.customerId !== actor.id) {
      throw new Error('forbidden')
    }
    if (order.status !== 'PLACED' && order.status !== 'PAYMENT_CONFIRMED') {
      throw new Error('cancellation_admin_only')
    }
  }

  const payment = order.payments[0]
  const paymentSucceeded = payment?.status === 'SUCCEEDED' && !!payment.providerRef
  const refundAmount = paymentSucceeded ? Number(payment!.amount) : 0

  // Stock from already-shipped fulfillments was physically dispatched —
  // do not restore it. (PARTIALLY_SHIPPED is filtered above; this set
  // is empty in practice for the states that reach here, but the guard
  // mirrors the original admin behavior.)
  const shippedVendorIds = new Set(
    order.fulfillments
      .filter(f => f.status === 'SHIPPED' || f.status === 'DELIVERED')
      .map(f => f.vendorId),
  )

  async function cascadeAndRestoreStock(
    tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  ): Promise<void> {
    await tx.vendorFulfillment.updateMany({
      where: {
        orderId,
        status: { notIn: ['SHIPPED', 'DELIVERED', 'CANCELLED'] },
      },
      data: { status: 'CANCELLED' },
    })
    for (const line of orderLines) {
      if (!line.product.trackStock) continue
      if (shippedVendorIds.has(line.vendorId)) continue
      if (line.variantId) {
        await tx.productVariant.update({
          where: { id: line.variantId },
          data: { stock: { increment: line.quantity } },
        })
        continue
      }
      await tx.product.update({
        where: { id: line.productId },
        data: { stock: { increment: line.quantity } },
      })
    }
  }

  // Pre-payment cancel: no Stripe call, no Refund row.
  if (!paymentSucceeded) {
    assertOrderTransition(order.status, 'CANCELLED')
    await db.$transaction(async tx => {
      await tx.order.update({
        where: { id: orderId, status: order.status },
        data: { status: 'CANCELLED' },
      })
      await cascadeAndRestoreStock(tx)
      await tx.orderEvent.create({
        data: {
          orderId,
          actorId: actor.id,
          type: 'ORDER_CANCELLED',
          payload: { reason, actor: actor.type },
        },
      })
    }, TX_OPTIONS)

    trackServer(
      'order.cancelled',
      { refundIssued: false, orderId, actor: actor.type },
      { distinctId: actor.id, dedupeKey: `${orderId}:${actor.id}:cancel` },
    )
    return { refundIssued: false }
  }

  // Post-payment cancel: full refund via Stripe FIRST. If Stripe throws,
  // local state stays untouched and the caller surfaces the error.
  if (!canTransitionOrder(order.status, 'REFUNDED')) {
    // Defensive: should never hit (we filtered SHIPPED+ above).
    throw new Error('cancellation_requires_incident')
  }

  const refundResult = await refundPaymentIntent(
    payment!.providerRef!,
    Math.round(refundAmount * 100),
    {
      fundedBy: 'PLATFORM',
      idempotencyKey: `cancel_${orderId}`,
      metadata: {
        orderId,
        reason,
        actor: actor.type,
      },
    },
  )

  assertOrderTransition(order.status, 'REFUNDED')
  await db.$transaction(async tx => {
    await tx.refund.create({
      data: {
        paymentId: payment!.id,
        amount: refundAmount,
        reason: `cancel · ${reason}`,
        fundedBy: 'PLATFORM',
        providerRef: refundResult.id,
      },
    })
    await tx.payment.update({
      where: { id: payment!.id },
      data: { status: 'REFUNDED' },
    })
    await tx.order.update({
      where: { id: orderId, status: order.status },
      data: { status: 'REFUNDED', paymentStatus: 'REFUNDED' },
    })
    await cascadeAndRestoreStock(tx)
    await tx.orderEvent.create({
      data: {
        orderId,
        actorId: actor.id,
        type: 'REFUND_ISSUED',
        payload: {
          providerRef: payment!.providerRef,
          providerRefundRef: refundResult.id,
          amount: refundAmount,
          fundedBy: 'PLATFORM',
          reason,
          actor: actor.type,
          isFullRefund: true,
          recordedAt: new Date().toISOString(),
        },
      },
    })
  }, TX_OPTIONS)

  logger.info('order.cancel.refund_issued', {
    orderId,
    providerRefundRef: refundResult.id,
    amountCents: Math.round(refundAmount * 100),
    actor: actor.type,
  })

  trackServer(
    'order.cancelled',
    { refundIssued: true, orderId, actor: actor.type, refundAmount },
    { distinctId: actor.id, dedupeKey: `${orderId}:${actor.id}:cancel` },
  )

  return { refundIssued: true, refundAmount }
}
