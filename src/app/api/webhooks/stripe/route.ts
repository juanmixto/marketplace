import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  assertProviderRefForPaymentStatus,
  doesWebhookPaymentMatchStoredPayment,
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
import { sendSubscriptionPaymentFailedEmail } from '@/domains/subscriptions/emails'
import { logger } from '@/lib/logger'
import { isFeatureEnabled } from '@/lib/flags'
import type Stripe from 'stripe'

type WebhookEvent = {
  id?: string
  type: string
  data: {
    object: unknown
  }
}

function logInvalidWebhookPayload(event: Stripe.Event | WebhookEvent) {
  logger.error('stripe.webhook.invalid_payload', {
    eventId: event.id ?? null,
    eventType: event.type,
    objectType:
      event.data.object && typeof event.data.object === 'object'
        ? Object.prototype.toString.call(event.data.object)
        : typeof event.data.object,
  })
}

/**
 * Resolve the `event.created` unix timestamp into a JS Date. Stripe
 * sends `created` as seconds-since-epoch; mock events from tests may
 * omit it, in which case we fall back to "now" (the watermark guard
 * still works for replays of the same payload).
 */
function eventCreatedAt(event: Stripe.Event | WebhookEvent): Date {
  const created = (event as { created?: number }).created
  if (typeof created === 'number' && Number.isFinite(created)) {
    return new Date(created * 1000)
  }
  return new Date()
}

/**
 * Stripe webhook handler.
 * Verifies signature to prevent spoofing.
 * Handles: payment_intent.succeeded, payment_intent.payment_failed
 */
export async function POST(req: NextRequest) {
  // Emergency kill switch. Returning 503 (not 200) is intentional:
  // Stripe will retry the event with exponential backoff for up to
  // 3 days, so when we reopen the switch the queue drains itself.
  // Never swallow an event — losing a payment confirmation is far
  // worse than a delayed one. Fail-open in src/lib/flags.ts means a
  // PostHog outage does NOT wedge the webhook.
  if (!(await isFeatureEnabled('kill-stripe-webhook'))) {
    logger.warn('stripe.webhook.kill_switch_active', {})
    return NextResponse.json(
      { error: 'webhook temporarily disabled' },
      { status: 503 }
    )
  }

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

  logger.info('stripe.webhook.received', {
    eventId: event.id ?? null,
    eventType: event.type,
    provider: env.paymentProvider,
  })

  // Idempotency: try to insert a WebhookDelivery row. If the unique
  // constraint on (provider, eventId) fires, it's a replay — skip.
  // This replaces the previous JSON-path lookup against OrderEvent.payload
  // and covers ALL event types (payment_intent.*, customer.subscription.*,
  // invoice.*) uniformly. The per-subscription watermark from #417 is
  // complementary: it catches out-of-order events with _different_ ids.
  const eventId = event.id ?? null
  let deliveryId: string | null = null
  if (eventId) {
    const payloadHash = createHash('sha256').update(body).digest('hex')
    try {
      const delivery = await db.webhookDelivery.create({
        data: {
          provider: 'stripe',
          eventId,
          eventType: event.type,
          payloadHash,
        },
      })
      deliveryId = delivery.id
    } catch (insertError) {
      const isDuplicate =
        insertError instanceof Error && /P2002|Unique constraint/i.test(insertError.message)
      if (isDuplicate) {
        logger.info('stripe.webhook.duplicate', {
          eventId,
          eventType: event.type,
        })
        return NextResponse.json({ received: true, skipped: 'duplicate' })
      }
      // Non-duplicate DB error: log but don't block the webhook. Stripe
      // will retry, and next time the insert might succeed. Failing open
      // is safer than failing closed (which would make Stripe stop
      // retrying and silently drop the event).
      logger.error('stripe.webhook.delivery_insert_failed', {
        eventId,
        eventType: event.type,
        error: insertError instanceof Error ? insertError.message : String(insertError),
      })
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
      // Phase 4b-α: subscription lifecycle. The handlers below dedupe by
      // event.created (a monotonically increasing per-object Stripe
      // timestamp) using Subscription.lastStripeEventAt as a watermark.
      // This protects against Stripe's documented out-of-order delivery,
      // not just literal replays of the same eventId — the future
      // WebhookDelivery dedupe (#308) is complementary, not a substitute.
      case 'customer.subscription.created': {
        const parsed = parseStripeSubscriptionEvent(event.data.object)
        if (!parsed) {
          logInvalidWebhookPayload(event)
          break
        }
        await handleSubscriptionCreated(parsed, eventCreatedAt(event))
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const parsed = parseStripeSubscriptionEvent(event.data.object)
        if (!parsed) {
          logInvalidWebhookPayload(event)
          break
        }
        await handleSubscriptionSync(parsed, event.type, eventCreatedAt(event))
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
        await handleInvoicePaid(invoice, eventCreatedAt(event))
        break
      }
      case 'invoice.payment_failed': {
        const invoice = parseStripeInvoiceEvent(event.data.object)
        if (!invoice || !invoice.subscription) {
          logInvalidWebhookPayload(event)
          break
        }
        await handleInvoicePaymentFailed(invoice, eventCreatedAt(event))
        break
      }
    }
  } catch (err) {
    logger.error('stripe.webhook.processing_failed', {
      eventId,
      eventType: event.type,
      error: err,
    })
    if (deliveryId) {
      await db.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      }).catch(updateErr => {
        logger.error('stripe.webhook.delivery_update_failed', {
          eventId,
          deliveryId,
          error: updateErr,
        })
      })
    }
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }

  if (deliveryId) {
    await db.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'processed', processedAt: new Date() },
    }).catch(updateErr => {
      logger.error('stripe.webhook.delivery_update_failed', {
        eventId,
        deliveryId,
        error: updateErr,
      })
    })
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
    logger.error('stripe.webhook.payment_mismatch', {
      eventId,
      orderId: payment.orderId,
      providerRef,
      expectedAmount: Number(payment.amount),
      receivedAmount: amount,
      expectedCurrency: payment.currency,
      receivedCurrency: currency,
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
  payload: StripeSubscriptionEventPayload,
  eventCreatedAt: Date
) {
  // Idempotent: if we already have a local row tied to this Stripe
  // subscription id, this is a replay and we skip straight to the sync
  // path below (which carries the same out-of-order guard).
  const existing = await db.subscription.findUnique({
    where: { stripeSubscriptionId: payload.id },
    select: { id: true },
  })
  if (existing) {
    await handleSubscriptionSync(payload, 'customer.subscription.updated', eventCreatedAt)
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
    logger.error('stripe.webhook.subscription_created_missing_metadata', {
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
    logger.error('stripe.webhook.subscription_created_plan_missing', {
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
    logger.error('stripe.webhook.subscription_created_address_missing', {
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
      lastStripeEventAt: eventCreatedAt,
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
      lastStripeEventAt: eventCreatedAt,
    },
  })
}

async function handleInvoicePaid(
  invoice: {
    id: string
    subscription: string | null
    amount_paid: number
  },
  eventCreatedAt: Date
) {
  if (!invoice.subscription) return
  const subscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription },
    select: { id: true, lastStripeEventAt: true },
  })
  if (!subscription) {
    // Likely: the `customer.subscription.created` event has not arrived
    // yet (Stripe does not guarantee delivery order). Log at info and
    // rely on Stripe's retry to deliver this event again after the
    // created event has been processed.
    logger.info('stripe.webhook.invoice_paid_subscription_not_found', {
      stripeSubscriptionId: invoice.subscription,
      invoiceId: invoice.id,
    })
    return
  }
  // Out-of-order guard: drop stale invoice events whose `created` is
  // older than the watermark. materializeSubscriptionRenewal also has
  // its own per-invoice idempotency, but this catches old events
  // before we touch Order/Payment rows.
  if (
    subscription.lastStripeEventAt &&
    eventCreatedAt.getTime() < subscription.lastStripeEventAt.getTime()
  ) {
    logger.info('stripe.webhook.invoice_paid_stale', {
      stripeSubscriptionId: invoice.subscription,
      invoiceId: invoice.id,
      eventCreatedAt: eventCreatedAt.toISOString(),
      lastStripeEventAt: subscription.lastStripeEventAt.toISOString(),
    })
    return
  }
  await materializeSubscriptionRenewal({
    invoiceId: invoice.id,
    subscriptionId: subscription.id,
    amountPaidCents: invoice.amount_paid,
  })
  await db.subscription.update({
    where: { id: subscription.id },
    data: { lastStripeEventAt: eventCreatedAt },
  })
}

async function handleInvoicePaymentFailed(
  invoice: {
    id: string
    subscription: string | null
  },
  eventCreatedAt: Date
) {
  if (!invoice.subscription) return
  const subscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription },
    include: {
      buyer: { select: { email: true, firstName: true } },
      plan: {
        include: {
          product: { select: { name: true } },
          vendor: { select: { displayName: true } },
        },
      },
    },
  })
  if (!subscription) return
  // Out-of-order guard: drop stale events older than the watermark.
  if (
    subscription.lastStripeEventAt &&
    eventCreatedAt.getTime() < subscription.lastStripeEventAt.getTime()
  ) {
    logger.info('stripe.webhook.invoice_payment_failed_stale', {
      stripeSubscriptionId: invoice.subscription,
      invoiceId: invoice.id,
      eventCreatedAt: eventCreatedAt.toISOString(),
      lastStripeEventAt: subscription.lastStripeEventAt.toISOString(),
    })
    return
  }
  if (subscription.status === 'PAST_DUE' || subscription.status === 'CANCELED') {
    await db.subscription.update({
      where: { id: subscription.id },
      data: { lastStripeEventAt: eventCreatedAt },
    })
    return
  }

  await db.subscription.update({
    where: { id: subscription.id },
    data: { status: 'PAST_DUE', lastStripeEventAt: eventCreatedAt },
  })

  // Phase 4b-δ: email the buyer so they can update their card. Best-effort.
  if (subscription.buyer.email) {
    await sendSubscriptionPaymentFailedEmail({
      to: subscription.buyer.email,
      customerName: subscription.buyer.firstName || 'cliente',
      productName: subscription.plan.product.name,
      vendorName: subscription.plan.vendor.displayName,
    })
  }
}

async function handleSubscriptionSync(
  payload: { id: string; status: string; pause_collection?: unknown; canceled_at?: number | null },
  eventType: 'customer.subscription.updated' | 'customer.subscription.deleted',
  eventCreatedAt: Date
) {
  const subscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: payload.id },
    select: { id: true, status: true, canceledAt: true, lastStripeEventAt: true },
  })

  if (!subscription) {
    // Phase 4b-α: buyers cannot subscribe yet (no public subscribe flow),
    // so most events will arrive with a stripeSubscriptionId that is not
    // in our DB. This is expected and a no-op. Logged at info level so we
    // can spot wiring issues in phase 4b-β when the public flow opens.
    logger.info('stripe.webhook.subscription_not_found', {
      stripeSubscriptionId: payload.id,
      eventType,
    })
    return
  }

  // Out-of-order guard: drop events whose `created` is older than the
  // watermark. Without this, a stale `updated(ACTIVE)` arriving after a
  // newer `deleted(CANCELED)` would resurrect a cancelled subscription.
  if (
    subscription.lastStripeEventAt &&
    eventCreatedAt.getTime() < subscription.lastStripeEventAt.getTime()
  ) {
    logger.info('stripe.webhook.subscription_sync_stale', {
      stripeSubscriptionId: payload.id,
      eventType,
      eventCreatedAt: eventCreatedAt.toISOString(),
      lastStripeEventAt: subscription.lastStripeEventAt.toISOString(),
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
    // asks for. Still bump the watermark so an even older event that
    // arrives later cannot pass the guard.
    await db.subscription.update({
      where: { id: subscription.id },
      data: { lastStripeEventAt: eventCreatedAt },
    })
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
      lastStripeEventAt: eventCreatedAt,
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
    logger.error('stripe.webhook.dead_letter_record_failed', {
      error: recordError,
    })
  }
}
