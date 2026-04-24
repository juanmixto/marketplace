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
export async function confirmOrder(orderId: string, providerRef: string) {
  const env = getServerEnv()
  if (env.paymentProvider !== 'mock') {
    throw new ManualConfirmationNotAllowedError()
  }

  const session = await getActionSession()
  if (!session) redirect('/login')

  const payment = await db.payment.findFirst({
    where: { orderId, providerRef },
    include: { order: true },
  })

  if (!payment) return
  if (payment.order.customerId !== session.user.id) {
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
