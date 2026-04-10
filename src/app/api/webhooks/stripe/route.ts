import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  assertProviderRefForPaymentStatus,
  doesWebhookPaymentMatchStoredPayment,
  shouldApplyPaymentFailed,
  shouldApplyPaymentSucceeded,
} from '@/domains/payments/webhook'
import {
  createPaymentConfirmedEventPayload,
  createPaymentFailedEventPayload,
  createPaymentMismatchEventPayload,
} from '@/domains/orders/order-event-payload'
import { getServerEnv } from '@/lib/env'
import type Stripe from 'stripe'

type WebhookPaymentIntent = {
  id: string
  amount?: number
  currency?: string
}

type WebhookEvent = {
  id?: string
  type: string
  data: {
    object: WebhookPaymentIntent
  }
}

function getWebhookPaymentIntent(event: Stripe.Event | WebhookEvent): WebhookPaymentIntent | null {
  const object = event.data.object

  if (
    object &&
    typeof object === 'object' &&
    'id' in object &&
    typeof object.id === 'string'
  ) {
    return {
      id: object.id,
      amount: 'amount' in object && typeof object.amount === 'number' ? object.amount : undefined,
      currency: 'currency' in object && typeof object.currency === 'string' ? object.currency : undefined,
    }
  }

  return null
}

/**
 * Stripe webhook handler.
 * Verifies signature to prevent spoofing.
 * Handles: payment_intent.succeeded, payment_intent.payment_failed
 */
export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')
  const env = getServerEnv()
  let event: Stripe.Event | WebhookEvent

  // Skip signature check in mock mode
  if (env.paymentProvider !== 'mock') {
    if (!sig || !env.stripeWebhookSecret) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
    }

    try {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(env.stripeSecretKey!)
      event = stripe.webhooks.constructEvent(body, sig, env.stripeWebhookSecret)
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }
  } else {
    event = JSON.parse(body)
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = getWebhookPaymentIntent(event)
        if (!pi) break
        await handlePaymentSucceeded(pi.id, pi.amount, pi.currency, event.id)
        break
      }
      case 'payment_intent.payment_failed': {
        const pi = getWebhookPaymentIntent(event)
        if (!pi) break
        await handlePaymentFailed(pi.id, event.id)
        break
      }
    }
  } catch (err) {
    console.error('[stripe-webhook]', err)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function handlePaymentSucceeded(providerRef: string, amount?: number, currency?: string, eventId?: string) {
  const payment = await db.payment.findUnique({
    where: { providerRef },
    include: { order: true },
  })
  if (!payment) return
  assertProviderRefForPaymentStatus({
    providerRef: payment.providerRef,
    nextStatus: 'SUCCEEDED',
  })

  if (!doesWebhookPaymentMatchStoredPayment(payment, { amount, currency })) {
    // Security: Amount mismatch indicates possible tampering or data inconsistency
    // Log fraud attempt with full details for investigation
    console.error('[PAYMENT_FRAUD_ALERT]', {
      orderId: payment.orderId,
      providerRef,
      expectedAmount: Number(payment.amount),
      receivedAmount: amount,
      expectedCurrency: payment.currency,
      receivedCurrency: currency,
      timestamp: new Date().toISOString(),
      eventId,
    })

    await db.orderEvent.create({
      data: {
        orderId: payment.orderId,
        type: 'PAYMENT_MISMATCH',
        payload: createPaymentMismatchEventPayload({
          providerRef,
          amount,
          currency,
          eventId,
          expectedAmount: Number(payment.amount),
          expectedCurrency: payment.currency,
        }),
      },
    })

    // DO NOT confirm this order - amount verification failed
    return
  }

  if (!shouldApplyPaymentSucceeded({
    paymentStatus: payment.status,
    orderPaymentStatus: payment.order.paymentStatus,
    orderStatus: payment.order.status,
  })) return

  await db.$transaction(async tx => {
    const paymentUpdate = await tx.payment.updateMany({
      where: { providerRef, status: { not: 'SUCCEEDED' } },
      data: { status: 'SUCCEEDED' },
    })

    const orderUpdate = await tx.order.updateMany({
      where: {
        id: payment.orderId,
        OR: [
          { paymentStatus: { not: 'SUCCEEDED' } },
          { status: { not: 'PAYMENT_CONFIRMED' } },
        ],
      },
      data: { status: 'PAYMENT_CONFIRMED', paymentStatus: 'SUCCEEDED' },
    })

    if (paymentUpdate.count > 0 || orderUpdate.count > 0) {
      await tx.orderEvent.create({
        data: {
          orderId: payment.orderId,
          type: 'PAYMENT_CONFIRMED',
          payload: createPaymentConfirmedEventPayload({ providerRef, amount, eventId }),
        },
      })
    }
  })
}

async function handlePaymentFailed(providerRef: string, eventId?: string) {
  const payment = await db.payment.findUnique({
    where: { providerRef },
    include: { order: true },
  })
  if (!payment) return

  if (!shouldApplyPaymentFailed({
    paymentStatus: payment.status,
    orderPaymentStatus: payment.order.paymentStatus,
    orderStatus: payment.order.status,
  })) return

  await db.$transaction(async tx => {
    const paymentUpdate = await tx.payment.updateMany({
      where: { providerRef, status: 'PENDING' },
      data: { status: 'FAILED' },
    })

    const orderUpdate = await tx.order.updateMany({
      where: { id: payment.orderId, paymentStatus: 'PENDING' },
      data: { paymentStatus: 'FAILED' },
    })

    if (paymentUpdate.count > 0 || orderUpdate.count > 0) {
      await tx.orderEvent.create({
        data: {
          orderId: payment.orderId,
          type: 'PAYMENT_FAILED',
          payload: createPaymentFailedEventPayload({ providerRef, eventId }),
        },
      })
    }
  })
}
