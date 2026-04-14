'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { getServerEnv } from '@/lib/env'
import { safeRevalidatePath } from '@/lib/revalidate'
import {
  advanceByCadence,
  computeCurrentPeriodEnd,
  computeFirstDeliveryAt,
  isBeforeCutoff,
} from '@/domains/subscriptions/cadence'
import {
  cancelStripeSubscription,
  createSubscriptionCheckoutSession,
  ensureStripeCustomerId,
  pauseStripeSubscription,
  resumeStripeSubscription,
} from '@/domains/subscriptions/stripe-subscriptions'

/**
 * Phase 4a of the promotions & subscriptions RFC. Buyer-facing subscription
 * lifecycle: subscribe, list, cancel, skip, pause, resume. Feature-gated
 * by the SUBSCRIPTIONS_BUYER_BETA env flag: until it flips to 'true' the
 * mutations refuse to run, so no buyer can end up with a dangling record
 * while Stripe billing (phase 4b) is still in flight.
 *
 * Reads (listMySubscriptions / getMySubscription) are always available so
 * the `/cuenta/suscripciones` page can render its empty state and its
 * beta banner without additional gating.
 */

async function requireBuyer() {
  const session = await getActionSession()
  if (!session) redirect('/login')
  return { session, buyerId: session.user.id }
}

function assertBetaEnabled() {
  if (!getServerEnv().subscriptionsBuyerBeta) {
    throw new Error(
      'Las suscripciones todavía no están disponibles. Estamos activando el cobro recurrente — vuelve a intentarlo en unos días.'
    )
  }
}

const subscribeSchema = z.object({
  planId: z.string().min(1, 'Selecciona un plan'),
  shippingAddressId: z.string().min(1, 'Selecciona una dirección'),
})

export type SubscribeInput = z.infer<typeof subscribeSchema>

export async function subscribeToPlan(input: SubscribeInput) {
  const { buyerId } = await requireBuyer()
  assertBetaEnabled()
  const data = subscribeSchema.parse(input)

  // Load the plan and assert it is in a subscribable state. The vendor
  // may have archived it between the moment the buyer loaded the product
  // page and the moment they hit subscribe.
  const plan = await db.subscriptionPlan.findFirst({
    where: { id: data.planId, archivedAt: null },
    include: {
      product: { select: { id: true, status: true, deletedAt: true } },
    },
  })
  if (!plan) throw new Error('Plan de suscripción no encontrado')
  if (plan.product.status !== 'ACTIVE' || plan.product.deletedAt !== null) {
    throw new Error('Este producto ya no está disponible para suscripción')
  }

  // Address ownership — the address must belong to the buyer, full stop.
  const address = await db.address.findFirst({
    where: { id: data.shippingAddressId, userId: buyerId },
    select: { id: true },
  })
  if (!address) throw new Error('Dirección de envío no encontrada')

  // One subscription per (buyer, plan). If a previous one exists and is
  // CANCELED, we refuse and point the buyer at creating a brand new plan
  // — re-activating a CANCELED row would re-use a stale snapshot price
  // and is more trouble than it is worth for phase 4a.
  const existing = await db.subscription.findUnique({
    where: { buyerId_planId: { buyerId, planId: plan.id } },
    select: { id: true, status: true },
  })
  if (existing) {
    if (existing.status === 'CANCELED') {
      throw new Error(
        'Ya tuviste una suscripción a este plan. Ponte en contacto con soporte para reactivarla.'
      )
    }
    throw new Error('Ya estás suscrito a este plan')
  }

  const now = new Date()
  const nextDeliveryAt = computeFirstDeliveryAt(now, plan.cadence)
  const currentPeriodEnd = computeCurrentPeriodEnd(nextDeliveryAt, plan.cadence)

  const subscription = await db.subscription.create({
    data: {
      buyerId,
      planId: plan.id,
      shippingAddressId: address.id,
      status: 'ACTIVE',
      currentPeriodEnd,
      nextDeliveryAt,
    },
  })

  safeRevalidatePath('/cuenta/suscripciones')
  return subscription
}

/**
 * Phase 4b-β: kicks off a Stripe Checkout Session for a subscription
 * plan. The local Subscription row is NOT created here — the webhook
 * handler for `customer.subscription.created` creates it after Stripe
 * confirms the buyer entered a valid payment method. This avoids
 * orphan "subscribed but not charged" rows from abandoned checkouts.
 *
 * Returns the Checkout Session URL so the client can redirect the
 * buyer to Stripe's hosted page. Gated by SUBSCRIPTIONS_BUYER_BETA.
 */
export async function startSubscriptionCheckout(
  input: SubscribeInput
): Promise<{ url: string }> {
  const { buyerId, session } = await requireBuyer()
  assertBetaEnabled()
  const data = subscribeSchema.parse(input)

  const plan = await db.subscriptionPlan.findFirst({
    where: { id: data.planId, archivedAt: null },
    include: {
      product: { select: { id: true, status: true, deletedAt: true } },
    },
  })
  if (!plan) throw new Error('Plan de suscripción no encontrado')
  if (plan.product.status !== 'ACTIVE' || plan.product.deletedAt !== null) {
    throw new Error('Este producto ya no está disponible para suscripción')
  }
  if (!plan.stripePriceId) {
    throw new Error(
      'Este plan todavía no está sincronizado con el proveedor de pagos. Inténtalo de nuevo en unos minutos.'
    )
  }

  const address = await db.address.findFirst({
    where: { id: data.shippingAddressId, userId: buyerId },
    select: { id: true },
  })
  if (!address) throw new Error('Dirección de envío no encontrada')

  // Block re-subscribe when an ACTIVE / PAUSED / PAST_DUE row already
  // exists. A CANCELED row does NOT block — Stripe will create a new
  // subscription id and the webhook handler upserts the local row.
  const existing = await db.subscription.findUnique({
    where: { buyerId_planId: { buyerId, planId: plan.id } },
    select: { status: true },
  })
  if (existing && existing.status !== 'CANCELED') {
    throw new Error('Ya estás suscrito a este plan')
  }

  const customerId = await ensureStripeCustomerId({
    userId: buyerId,
    email: session.user.email ?? '',
    name: session.user.name ?? '',
  })

  const appUrl = getServerEnv().appUrl
  const checkout = await createSubscriptionCheckoutSession({
    customerId,
    stripePriceId: plan.stripePriceId,
    successUrl: `${appUrl}/cuenta/suscripciones?checkout=success`,
    cancelUrl: `${appUrl}/productos?checkout=cancel`,
    metadata: {
      marketplacePlanId: plan.id,
      marketplaceBuyerId: buyerId,
      marketplaceShippingAddressId: address.id,
    },
  })

  return { url: checkout.url }
}

/**
 * Plain-JS shape returned to server components. Decimal fields on the
 * joined plan are converted to numbers so the row crosses the RSC
 * boundary cleanly. The tests call Number() on these values already,
 * which is a no-op on real numbers.
 */
export interface SerializedBuyerSubscription {
  id: string
  buyerId: string
  planId: string
  shippingAddressId: string
  status: 'ACTIVE' | 'PAUSED' | 'CANCELED' | 'PAST_DUE'
  currentPeriodEnd: Date
  nextDeliveryAt: Date
  skippedDeliveries: unknown
  stripeSubscriptionId: string | null
  createdAt: Date
  updatedAt: Date
  canceledAt: Date | null
  plan: {
    id: string
    cadence: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
    priceSnapshot: number
    taxRateSnapshot: number
    cutoffDayOfWeek: number
    product: {
      id: string
      name: string
      slug: string
      images: string[]
      unit: string
    }
    vendor: {
      id: string
      slug: string
      displayName: string
    }
  }
  shippingAddress: {
    id: string
    firstName: string
    lastName: string
    line1: string
    line2: string | null
    city: string
    province: string
    postalCode: string
    country: string
  }
}

export async function listMySubscriptions(
  filter: 'active' | 'canceled' | 'all' = 'all'
): Promise<SerializedBuyerSubscription[]> {
  const { buyerId } = await requireBuyer()
  const rows = await db.subscription.findMany({
    where: {
      buyerId,
      ...(filter === 'active' && { status: { not: 'CANCELED' } }),
      ...(filter === 'canceled' && { status: 'CANCELED' }),
    },
    orderBy: [{ canceledAt: 'asc' }, { createdAt: 'desc' }],
    include: {
      plan: {
        include: {
          product: { select: { id: true, name: true, slug: true, images: true, unit: true } },
          vendor:  { select: { id: true, slug: true, displayName: true } },
        },
      },
      shippingAddress: true,
    },
  })

  return rows.map(row => ({
    id: row.id,
    buyerId: row.buyerId,
    planId: row.planId,
    shippingAddressId: row.shippingAddressId,
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd,
    nextDeliveryAt: row.nextDeliveryAt,
    skippedDeliveries: row.skippedDeliveries,
    stripeSubscriptionId: row.stripeSubscriptionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    canceledAt: row.canceledAt,
    plan: {
      id: row.plan.id,
      cadence: row.plan.cadence,
      priceSnapshot: Number(row.plan.priceSnapshot),
      taxRateSnapshot: Number(row.plan.taxRateSnapshot),
      cutoffDayOfWeek: row.plan.cutoffDayOfWeek,
      product: row.plan.product,
      vendor: row.plan.vendor,
    },
    shippingAddress: {
      id: row.shippingAddress.id,
      firstName: row.shippingAddress.firstName,
      lastName: row.shippingAddress.lastName,
      line1: row.shippingAddress.line1,
      line2: row.shippingAddress.line2,
      city: row.shippingAddress.city,
      province: row.shippingAddress.province,
      postalCode: row.shippingAddress.postalCode,
      country: row.shippingAddress.country,
    },
  }))
}

export async function getMySubscription(id: string) {
  const { buyerId } = await requireBuyer()
  return db.subscription.findFirst({
    where: { id, buyerId },
    include: {
      plan: { include: { product: true } },
      shippingAddress: true,
    },
  })
}

async function loadOwnedSubscription(id: string, buyerId: string) {
  const subscription = await db.subscription.findFirst({
    where: { id, buyerId },
    include: { plan: true },
  })
  if (!subscription) throw new Error('Suscripción no encontrada')
  return subscription
}

export async function cancelSubscription(id: string) {
  const { buyerId } = await requireBuyer()
  const sub = await loadOwnedSubscription(id, buyerId)
  if (sub.status === 'CANCELED') return sub

  const updated = await db.subscription.update({
    where: { id },
    data: { status: 'CANCELED', canceledAt: new Date() },
  })

  // Phase 4b-γ: tell Stripe to stop billing. We run the Stripe call
  // AFTER the local update so a Stripe outage leaves us with a correctly
  // canceled local row that the reconcile webhook (customer.subscription.
  // deleted, phase 4b-α) will later confirm. If Stripe errors we log
  // and still return the local row — the buyer sees their cancel
  // reflected in our UI, which is the minimum we can promise.
  try {
    await cancelStripeSubscription(sub.stripeSubscriptionId)
  } catch (err) {
    console.error('[subscriptions] Stripe cancel failed — local row is canceled, Stripe will need manual reconcile', {
      subscriptionId: id,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      error: err,
    })
  }

  safeRevalidatePath('/cuenta/suscripciones')
  return updated
}

export async function pauseSubscription(id: string) {
  const { buyerId } = await requireBuyer()
  const sub = await loadOwnedSubscription(id, buyerId)
  if (sub.status === 'CANCELED') {
    throw new Error('No se puede pausar una suscripción cancelada')
  }
  if (sub.status === 'PAUSED') return sub

  const updated = await db.subscription.update({
    where: { id },
    data: { status: 'PAUSED' },
  })

  // Phase 4b-γ: mirror the pause into Stripe so invoice collection
  // stops. If Stripe errors we log and keep the local row paused —
  // the next customer.subscription.updated webhook will reconcile if
  // Stripe's own state diverges.
  try {
    await pauseStripeSubscription(sub.stripeSubscriptionId)
  } catch (err) {
    console.error('[subscriptions] Stripe pause failed — local row is paused, Stripe will need manual reconcile', {
      subscriptionId: id,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      error: err,
    })
  }

  safeRevalidatePath('/cuenta/suscripciones')
  return updated
}

export async function resumeSubscription(id: string) {
  const { buyerId } = await requireBuyer()
  const sub = await loadOwnedSubscription(id, buyerId)
  if (sub.status !== 'PAUSED') {
    throw new Error('Solo puedes reanudar una suscripción pausada')
  }

  // When resuming, bump the next delivery to one cadence from now so the
  // buyer gets their usual preparation window.
  const now = new Date()
  const nextDeliveryAt = computeFirstDeliveryAt(now, sub.plan.cadence)
  const currentPeriodEnd = computeCurrentPeriodEnd(nextDeliveryAt, sub.plan.cadence)

  const updated = await db.subscription.update({
    where: { id },
    data: {
      status: 'ACTIVE',
      nextDeliveryAt,
      currentPeriodEnd,
    },
  })

  // Phase 4b-γ: resume invoice collection in Stripe. Same failure
  // posture as pause/cancel — log and keep the local row in sync.
  try {
    await resumeStripeSubscription(sub.stripeSubscriptionId)
  } catch (err) {
    console.error('[subscriptions] Stripe resume failed — local row is active, Stripe will need manual reconcile', {
      subscriptionId: id,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      error: err,
    })
  }

  safeRevalidatePath('/cuenta/suscripciones')
  return updated
}

export async function skipNextDelivery(id: string) {
  const { buyerId } = await requireBuyer()
  const sub = await loadOwnedSubscription(id, buyerId)
  if (sub.status !== 'ACTIVE') {
    throw new Error('Solo puedes saltar entregas en una suscripción activa')
  }

  const now = new Date()
  if (!isBeforeCutoff(now, sub.nextDeliveryAt, sub.plan.cutoffDayOfWeek)) {
    throw new Error(
      'Ya ha pasado el día de cierre para saltar esta entrega. Aplica a la próxima.'
    )
  }

  const skipped = Array.isArray(sub.skippedDeliveries)
    ? (sub.skippedDeliveries as unknown[]).filter((v): v is string => typeof v === 'string')
    : []
  const skippedDate = sub.nextDeliveryAt.toISOString().slice(0, 10)
  if (skipped.includes(skippedDate)) return sub

  const advancedNextDelivery = advanceByCadence(sub.nextDeliveryAt, sub.plan.cadence)
  const advancedPeriodEnd = computeCurrentPeriodEnd(advancedNextDelivery, sub.plan.cadence)

  const updated = await db.subscription.update({
    where: { id },
    data: {
      skippedDeliveries: [...skipped, skippedDate],
      nextDeliveryAt: advancedNextDelivery,
      currentPeriodEnd: advancedPeriodEnd,
    },
  })
  safeRevalidatePath('/cuenta/suscripciones')
  return updated
}
