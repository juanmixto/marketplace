import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  assertProviderRefForPaymentStatus,
  doesWebhookPaymentMatchStoredPayment,
  getWebhookIdempotencyKey,
  isMockWebhookAllowed,
  parseWebhookPaymentIntent,
  retryWebhookOperation,
  shouldApplyPaymentFailed,
  shouldApplyPaymentSucceeded,
} from '@/domains/payments/webhook'
import {
  createPaymentConfirmedEventPayload,
  createPaymentFailedEventPayload,
  createPaymentMismatchEventPayload,
} from '@/domains/orders/order-event-payload'
import { recordWebhookDeadLetter } from '@/domains/payments/webhook-dlq'
import { getServerEnv } from '@/lib/env'
import {
  mapStripeSubscriptionStatus,
  parseStripeInvoiceEvent,
  parseStripeSubscriptionEvent,
  type StripeSubscriptionEventPayload,
} from '@/domains/subscriptions/stripe-subscriptions'
import { materializeSubscriptionRenewal } from '@/domains/subscriptions/renewal'
import {
  computeFirstDeliveryAt,
  computeCurrentPeriodEnd,
} from '@/domains/subscriptions/cadence'
import type Stripe from 'stripe'

type WebhookEvent = {
  id?: string
  type: string
  data: {
    object: unknown
  }
}

function logInvalidWebhookPayload(event: Stripe.Event | WebhookEvent) {
  console.error('[stripe-webhook][invalid-payload]', {
    eventId: event.id ?? null,
    eventType: event.type,
    objectType:
      event.data.object && typeof event.data.object === 'object'
        ? Object.prototype.toString.call(event.data.object)
        : typeof event.data.object,
  })
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

  if (env.paymentProvider === 'mock') {
    // Mock mode: only allowed outside production to prevent spoofed events
    if (!isMockWebhookAllowed(env.paymentProvider, process.env.NODE_ENV ?? 'production')) {
      return NextResponse.json({ error: 'Mock webhooks disabled in production' }, { status: 403 })
    }
    event = JSON.parse(body)
  } else {
    // Stripe mode: verify HMAC signature using raw body (never parsed JSON)
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
  }

  // Idempotency: skip events already recorded in OrderEvent by eventId
  const idempotencyKey = getWebhookIdempotencyKey(event.id)
  if (idempotencyKey) {
    const alreadyProcessed = await db.orderEvent.findFirst({
      where: { payload: { path: ['eventId'], equals: idempotencyKey } },
      select: { id: true },
    })
    if (alreadyProcessed) {
      return NextResponse.json({ received: true, skipped: 'duplicate' })
    }
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = parseWebhookPaymentIntent(event.data.object)
        if (!pi) {
          logInvalidWebhookPayload(event)
          break
        }
        await handlePaymentSucceeded(pi.id, pi.amount, pi.currency, event.id)
        break
      }
      case 'payment_intent.payment_failed': {
        const pi = parseWebhookPaymentIntent(event.data.object)
        if (!pi) {
          logInvalidWebhookPayload(event)
          break
        }
        await handlePaymentFailed(pi.id, event.id)
        break
      }
      // Phase 4b-α: subscription lifecycle. The handler is idempotent by
      // construction (state-based sync — applying the same status twice
      // is a no-op) so we do not need the OrderEvent dedupe table here.
      // Phase 4b-β will add `invoice.paid` / `invoice.payment_failed`
      // handling that materializes Orders + VendorFulfillments.
      case 'customer.subscription.created': {
        const parsed = parseStripeSubscriptionEvent(event.data.object)
        if (!parsed) {
          logInvalidWebhookPayload(event)
          break
        }
        await handleSubscriptionCreated(parsed)
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const parsed = parseStripeSubscriptionEvent(event.data.object)
        if (!parsed) {
          logInvalidWebhookPayload(event)
          break
        }
        await handleSubscriptionSync(parsed, event.type)
        break
      }
      // Phase 4b-β: when Stripe charges a renewal invoice, materialize
      // an Order + OrderLine + VendorFulfillment so the vendor sees a
      // pending fulfillment in their dashboard just like a one-off
      // purchase. Idempotent via Payment.providerRef = invoice.id.
      case 'invoice.paid': {
        const invoice = parseStripeInvoiceEvent(event.data.object)
        if (!invoice || !invoice.subscription) {
          logInvalidWebhookPayload(event)
          break
        }
        await handleInvoicePaid(invoice)
        break
      }
      case 'invoice.payment_failed': {
        const invoice = parseStripeInvoiceEvent(event.data.object)
        if (!invoice || !invoice.subscription) {
          logInvalidWebhookPayload(event)
          break
        }
        await handleInvoicePaymentFailed(invoice)
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
  const payment = await retryWebhookOperation(
    () =>
      db.payment.findUnique({
        where: { providerRef },
        include: { order: true },
      }),
    { operationName: 'load payment for succeeded webhook' }
  )
  if (!payment) {
    await recordWebhookDeadLetter(db, {
      eventId,
      eventType: 'payment_intent.succeeded',
      providerRef,
      reason: 'payment_not_found',
      payload: { providerRef, amount, currency },
    })
    return
  }
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

    await retryWebhookOperation(
      () =>
        db.orderEvent.create({
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
        }),
      { operationName: 'record payment mismatch' }
    )

    // DO NOT confirm this order - amount verification failed
    return
  }

  if (!shouldApplyPaymentSucceeded({
    paymentStatus: payment.status,
    orderPaymentStatus: payment.order.paymentStatus,
    orderStatus: payment.order.status,
  })) return

  await retryWebhookOperation(
    () =>
      db.$transaction(async tx => {
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
      }),
    { operationName: 'confirm payment webhook' }
  ).catch(async error => {
    await recordWebhookRetryExhaustion({
      orderId: payment.orderId,
      stage: 'confirm_payment',
      providerRef,
      eventId,
      error,
    })
    throw error
  })
}

async function handlePaymentFailed(providerRef: string, eventId?: string) {
  const payment = await retryWebhookOperation(
    () =>
      db.payment.findUnique({
        where: { providerRef },
        include: { order: true },
      }),
    { operationName: 'load payment for failed webhook' }
  )
  if (!payment) {
    await recordWebhookDeadLetter(db, {
      eventId,
      eventType: 'payment_intent.payment_failed',
      providerRef,
      reason: 'payment_not_found',
      payload: { providerRef },
    })
    return
  }

  if (!shouldApplyPaymentFailed({
    paymentStatus: payment.status,
    orderPaymentStatus: payment.order.paymentStatus,
    orderStatus: payment.order.status,
  })) return

  await retryWebhookOperation(
    () =>
      db.$transaction(async tx => {
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
      }),
    { operationName: 'mark payment as failed' }
  ).catch(async error => {
    await recordWebhookRetryExhaustion({
      orderId: payment.orderId,
      stage: 'mark_failed',
      providerRef,
      eventId,
      error,
    })
    throw error
  })
}

async function handleSubscriptionCreated(
  payload: StripeSubscriptionEventPayload
) {
  // Idempotent: if we already have a local row tied to this Stripe
  // subscription id, this is a replay and we skip straight to the sync
  // path below.
  const existing = await db.subscription.findUnique({
    where: { stripeSubscriptionId: payload.id },
    select: { id: true },
  })
  if (existing) {
    await handleSubscriptionSync(payload, 'customer.subscription.updated')
    return
  }

  // The buyer action put the planId, buyerId and shippingAddressId into
  // the Checkout Session metadata, which Stripe copies onto the
  // resulting Subscription. Without these we cannot create a local row
  // — log at error level and bail so Stripe retries.
  const meta = payload.metadata ?? {}
  const planId = meta.marketplacePlanId
  const buyerId = meta.marketplaceBuyerId
  const shippingAddressId = meta.marketplaceShippingAddressId
  if (!planId || !buyerId || !shippingAddressId) {
    console.error('[stripe-webhook][subscription-created][missing-metadata]', {
      stripeSubscriptionId: payload.id,
      metadata: meta,
    })
    return
  }

  const plan = await db.subscriptionPlan.findUnique({
    where: { id: planId },
    select: { id: true, cadence: true, archivedAt: true },
  })
  if (!plan || plan.archivedAt) {
    console.error('[stripe-webhook][subscription-created][plan-missing]', {
      planId,
      stripeSubscriptionId: payload.id,
    })
    return
  }

  const address = await db.address.findFirst({
    where: { id: shippingAddressId, userId: buyerId },
    select: { id: true },
  })
  if (!address) {
    console.error('[stripe-webhook][subscription-created][address-missing]', {
      buyerId,
      shippingAddressId,
      stripeSubscriptionId: payload.id,
    })
    return
  }

  const now = new Date()
  const nextDeliveryAt = computeFirstDeliveryAt(now, plan.cadence)
  const currentPeriodEnd = computeCurrentPeriodEnd(nextDeliveryAt, plan.cadence)

  await db.subscription.upsert({
    where: {
      buyerId_planId: { buyerId, planId: plan.id },
    },
    create: {
      buyerId,
      planId: plan.id,
      shippingAddressId: address.id,
      status: mapStripeSubscriptionStatus(payload.status, payload.pause_collection),
      nextDeliveryAt,
      currentPeriodEnd,
      stripeSubscriptionId: payload.id,
    },
    update: {
      // The buyer had a prior CANCELED sub for the same plan (we block
      // this in subscribeToPlan but Stripe retries may resurface it).
      // Overwrite the row in place so there is only ever one.
      status: mapStripeSubscriptionStatus(payload.status, payload.pause_collection),
      shippingAddressId: address.id,
      nextDeliveryAt,
      currentPeriodEnd,
      stripeSubscriptionId: payload.id,
      canceledAt: null,
    },
  })
}

async function handleInvoicePaid(invoice: {
  id: string
  subscription: string | null
  amount_paid: number
}) {
  if (!invoice.subscription) return
  const subscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription },
    select: { id: true },
  })
  if (!subscription) {
    // Likely: the `customer.subscription.created` event has not arrived
    // yet (Stripe does not guarantee delivery order). Log at info and
    // rely on Stripe's retry to deliver this event again after the
    // created event has been processed.
    console.info('[stripe-webhook][invoice-paid][subscription-not-found]', {
      stripeSubscriptionId: invoice.subscription,
      invoiceId: invoice.id,
    })
    return
  }
  await materializeSubscriptionRenewal({
    invoiceId: invoice.id,
    subscriptionId: subscription.id,
    amountPaidCents: invoice.amount_paid,
  })
}

async function handleInvoicePaymentFailed(invoice: {
  id: string
  subscription: string | null
}) {
  if (!invoice.subscription) return
  const subscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription },
    select: { id: true, status: true },
  })
  if (!subscription) return
  if (subscription.status === 'PAST_DUE' || subscription.status === 'CANCELED') return

  await db.subscription.update({
    where: { id: subscription.id },
    data: { status: 'PAST_DUE' },
  })
}

async function handleSubscriptionSync(
  payload: { id: string; status: string; pause_collection?: unknown; canceled_at?: number | null },
  eventType: 'customer.subscription.updated' | 'customer.subscription.deleted'
) {
  const subscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: payload.id },
    select: { id: true, status: true, canceledAt: true },
  })

  if (!subscription) {
    // Phase 4b-α: buyers cannot subscribe yet (no public subscribe flow),
    // so most events will arrive with a stripeSubscriptionId that is not
    // in our DB. This is expected and a no-op. Logged at info level so we
    // can spot wiring issues in phase 4b-β when the public flow opens.
    console.info('[stripe-webhook][subscription-not-found]', {
      stripeSubscriptionId: payload.id,
      eventType,
    })
    return
  }

  // `customer.subscription.deleted` is Stripe's terminal cancelation
  // event — trust it over whatever `status` says on the object.
  const nextStatus =
    eventType === 'customer.subscription.deleted'
      ? 'CANCELED'
      : mapStripeSubscriptionStatus(payload.status, payload.pause_collection)

  if (subscription.status === nextStatus) {
    // Idempotent no-op — the row is already in the state this event
    // asks for. Common when Stripe retries a webhook.
    return
  }

  const canceledAt =
    nextStatus === 'CANCELED'
      ? subscription.canceledAt ?? new Date()
      : null

  await db.subscription.update({
    where: { id: subscription.id },
    data: {
      status: nextStatus,
      canceledAt,
    },
  })
}

async function recordWebhookRetryExhaustion({
  orderId,
  stage,
  providerRef,
  eventId,
  error,
}: {
  orderId: string
  stage: string
  providerRef: string
  eventId?: string
  error: unknown
}) {
  try {
    await db.orderEvent.create({
      data: {
        orderId,
        type: 'PAYMENT_WEBHOOK_RETRY_EXHAUSTED',
        payload: {
          providerRef,
          eventId,
          stage,
          error: error instanceof Error ? error.message : String(error),
          recordedAt: new Date().toISOString(),
        },
      },
    })
  } catch (recordError) {
    console.error('[stripe-webhook][dead-letter-record-failed]', recordError)
  }
}
