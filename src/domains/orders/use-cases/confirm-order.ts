'use server'

import { db } from '@/lib/db'
import { getServerEnv } from '@/lib/env'
import { getActionSession } from '@/lib/action-session'
import { redirect } from 'next/navigation'
import { logger } from '@/lib/logger'
import {
  assertProviderRefForPaymentStatus,
  shouldApplyPaymentSucceeded,
} from '@/domains/payments'
import { recordManualPaymentConfirmation } from '../payment-persistence'
import {
  InvalidCheckoutAmountError,
  ManualConfirmationNotAllowedError,
  OrderConfirmationForbiddenError,
} from '../errors'
import {
  dispatchSideEffects,
  recordOrderConfirmedSideEffects,
  recordPaymentMismatchSideEffects,
} from '../side-effects'
import { emit as emitNotification } from '@/domains/notifications'
import { AlreadyProcessedError, withIdempotency } from '@/lib/idempotency'

/**
 * `shouldApplyPaymentSucceeded` already makes this function a no-op on
 * the second call (terminal state guard), but on a flaky network we get
 * fast double-submits where both reads see PENDING and both attempt the
 * write. The IdempotencyKey table closes that window: the second caller
 * fails the UNIQUE and we swallow `AlreadyProcessedError` so the UI sees
 * the same `undefined` return as the legacy fast-path.
 *
 * Mock-only entry point today (the production path is the Stripe webhook,
 * which has its own dedupe via `WebhookDelivery`). Wrapping anyway keeps
 * the contract uniform and survives a future flip of `paymentProvider`.
 */
export async function confirmOrder(orderId: string, providerRef: string) {
  const env = getServerEnv()
  if (env.paymentProvider !== 'mock') {
    throw new ManualConfirmationNotAllowedError()
  }

  const session = await getActionSession()
  if (!session) redirect('/login')

  try {
    return await withIdempotency(
      'order.confirm',
      `${orderId}:${providerRef}`,
      session.user.id,
      () => confirmOrderInner(orderId, providerRef, session.user.id),
    )
  } catch (err) {
    if (err instanceof AlreadyProcessedError) return
    throw err
  }
}

async function confirmOrderInner(
  orderId: string,
  providerRef: string,
  sessionUserId: string,
) {

  // #968: Payment.providerRef is `@unique` in the schema, so findUnique
  // is the right primitive — findFirst silently allowed a full-table
  // scan if the index were ever dropped. The orderId guard is preserved
  // as an explicit assertion below; a Payment whose providerRef matches
  // but whose orderId differs is a routing bug, not a "not found".
  const payment = await db.payment.findUnique({
    where: { providerRef },
    include: { order: true },
  })

  if (!payment) return
  if (payment.orderId !== orderId) {
    // Caller-visible behaviour matches "not found" (return undefined),
    // but log distinctly so dashboards can separate the routing-bug
    // case from a genuinely absent payment.
    logger.warn('order.confirm.payment_order_mismatch', {
      orderId,
      paymentOrderId: payment.orderId,
      providerRef,
    })
    return
  }
  if (payment.order.customerId !== sessionUserId) {
    throw new OrderConfirmationForbiddenError()
  }
  assertProviderRefForPaymentStatus({
    providerRef: payment.providerRef,
    nextStatus: 'SUCCEEDED',
  })

  const expectedAmountCents = Math.round(Number(payment.amount) * 100)
  const orderGrandTotalCents = Math.round(Number(payment.order.grandTotal) * 100)
  if (expectedAmountCents !== orderGrandTotalCents) {
    logger.error('checkout.confirm_amount_mismatch', {
      orderId,
      orderNumber: payment.order.orderNumber,
      providerRef,
      paymentAmountCents: expectedAmountCents,
      orderGrandTotalCents,
    })
    await dispatchSideEffects(
      recordPaymentMismatchSideEffects({
        orderId,
        providerRef: providerRef ?? orderId,
        amount: orderGrandTotalCents,
        expectedAmount: Number(payment.amount),
        expectedCurrency: payment.currency,
      }),
      'events'
    )
    throw new InvalidCheckoutAmountError()
  }

  if (!shouldApplyPaymentSucceeded({
    paymentStatus: payment.status,
    orderPaymentStatus: payment.order.paymentStatus,
    orderStatus: payment.order.status,
  })) {
    await dispatchSideEffects(
      {
        shouldRevalidateCatalogExperience: false,
        revalidationPaths: ['/cuenta/pedidos'],
        notifications: [],
        events: [],
      },
      'revalidations'
    )
    return
  }

  await db.$transaction(async tx => {
    await recordManualPaymentConfirmation(tx, orderId, providerRef)
  })

  await dispatchSideEffects(recordOrderConfirmedSideEffects(orderId), 'revalidations')

  // CF-1 step 8: emit a buyer-targeted confirmation event so the email
  // handler can fire OrderConfirmationEmail. The vendor side already
  // gets `order.created` from the create-order path; this is the buyer
  // counterpart and fires once per order regardless of vendor count.
  emitNotification('order.buyer_confirmed', {
    orderId,
    customerUserId: payment.order.customerId,
  })
}

export async function getMyOrders() {
  const session = await getActionSession()
  if (!session) return []

  return db.order.findMany({
    where: { customerId: session.user.id },
    orderBy: { placedAt: 'desc' },
    include: {
      lines: {
        include: { product: { select: { name: true, images: true, slug: true } } },
      },
      reviews: { select: { productId: true } },
    },
  })
}

export async function getOrderDetail(orderId: string) {
  const session = await getActionSession()
  if (!session) return null

  return db.order.findFirst({
    where: { id: orderId, customerId: session.user.id },
    include: {
      lines: {
        include: { product: { select: { name: true, images: true, slug: true, unit: true } } },
      },
      address: true,
      payments: true,
      fulfillments: {
        include: {
          vendor: { select: { displayName: true } },
          shipment: {
            select: {
              status: true,
              carrierName: true,
              trackingNumber: true,
              trackingUrl: true,
            },
          },
        },
      },
    },
  })
}
