'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { isVendor } from '@/lib/roles'
import { safeRevalidatePath } from '@/lib/revalidate'
import {
  advanceByCadence,
  computeCurrentPeriodEnd,
  isBeforeCutoff,
} from '@/domains/subscriptions/cadence'
import {
  pauseStripeSubscription,
  provisionPlanPrice,
  resumeStripeSubscription,
} from '@/domains/subscriptions/stripe-subscriptions'

/**
 * Phase 3 of the promotions & subscriptions RFC
 * (docs/rfcs/0001-promotions-and-subscriptions.md). Vendor-side CRUD for
 * subscription plans — the buyer-facing purchase + Stripe Subscriptions
 * lands in phase 4. Plans in phase 3 are dormant: vendors can draft them,
 * archive them, but no buyer can subscribe yet.
 */

async function requireVendor() {
  const session = await getActionSession()
  if (!session || !isVendor(session.user.role)) redirect('/login')
  const vendor = await db.vendor.findUnique({ where: { userId: session.user.id } })
  if (!vendor) redirect('/login')
  return { session, vendor }
}

import {
  subscriptionPlanSchema,
  SUBSCRIPTION_CADENCES,
} from '@/shared/types/subscriptions'

// `'use server'` files cannot expose non-async exports — Next.js RSC
// strips them. We therefore (a) inline the input type here and (b)
// avoid `import type {...}` from a non-`'use server'` module above,
// because Turbopack's RSC scan still keys on the named import even
// when the `type` keyword erases it. Cross-module type consumers
// should import `SubscriptionPlanInput` directly from
// `@/shared/types/subscriptions`.
type SubscriptionPlanInput = z.infer<typeof subscriptionPlanSchema>

function cadenceLabel(cadence: (typeof SUBSCRIPTION_CADENCES)[number]): string {
  if (cadence === 'WEEKLY') return 'semanal'
  if (cadence === 'BIWEEKLY') return 'quincenal'
  return 'mensual'
}

export async function createSubscriptionPlan(input: SubscriptionPlanInput) {
  const { vendor } = await requireVendor()
  const data = subscriptionPlanSchema.parse(input)

  // Ownership + not-deleted guard. Only ACTIVE products can back a
  // subscription — a DRAFT or REJECTED product isn't visible to buyers, so
  // making a plan for it would be inert and confusing.
  const product = await db.product.findFirst({
    where: {
      id: data.productId,
      vendorId: vendor.id,
      deletedAt: null,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      name: true,
      basePrice: true,
      taxRate: true,
    },
  })
  if (!product) {
    throw new Error(
      'Solo puedes crear un plan para un producto activo de tu tienda'
    )
  }

  // Unique-by-(product, cadence): a product can now have one plan per
  // cadence (phase 4b-β — multi-cadence). We refuse a second plan with
  // the SAME cadence for the same product, but we allow e.g. (cesta,
  // WEEKLY) to coexist with (cesta, BIWEEKLY). The @@unique at the DB
  // level would raise P2002 anyway — the explicit check yields a
  // friendlier, cadence-aware message.
  const existing = await db.subscriptionPlan.findUnique({
    where: {
      productId_cadence: { productId: data.productId, cadence: data.cadence },
    },
    select: { id: true, archivedAt: true },
  })
  if (existing && !existing.archivedAt) {
    throw new Error(
      `Este producto ya tiene un plan ${cadenceLabel(data.cadence)} activo`,
    )
  }
  if (existing && existing.archivedAt) {
    throw new Error(
      `Este producto tiene un plan ${cadenceLabel(data.cadence)} archivado. Reactívalo desde la lista en lugar de crear uno nuevo.`,
    )
  }

  const plan = await db.subscriptionPlan.create({
    data: {
      vendorId: vendor.id,
      productId: product.id,
      cadence: data.cadence,
      // Snapshot the price + tax rate so a future product edit cannot
      // retroactively change the amount a buyer already committed to.
      priceSnapshot: product.basePrice,
      taxRateSnapshot: product.taxRate,
      cutoffDayOfWeek: data.cutoffDayOfWeek,
    },
  })

  // Phase 4b-α of the promotions RFC: provision a Stripe Price for the
  // plan so phase 4b-β can create Subscriptions that reference it. The
  // provisioning runs AFTER the row is committed — if Stripe rejects the
  // request (invalid key, outage, bad data) we clean up the orphan row
  // so the vendor can retry without hitting the
  // @@unique([productId, cadence]) constraint.
  try {
    const provisioning = await provisionPlanPrice({
      planId: plan.id,
      productName: product.name,
      priceEurCents: Math.round(Number(product.basePrice) * 100),
      cadence: data.cadence,
      taxRate: Number(product.taxRate),
      vendorStripeAccountId: vendor.stripeAccountId ?? null,
    })
    const updated = await db.subscriptionPlan.update({
      where: { id: plan.id },
      data: { stripePriceId: provisioning.stripePriceId },
    })
    safeRevalidatePath('/vendor/suscripciones')
    return updated
  } catch (error) {
    await db.subscriptionPlan
      .delete({ where: { id: plan.id } })
      .catch(cleanupError => {
        console.error(
          '[subscriptions] failed to clean up orphan plan after Stripe provisioning error',
          { planId: plan.id, cleanupError }
        )
      })
    console.error('[subscriptions] Stripe Price provisioning failed', {
      planId: plan.id,
      productId: product.id,
      error,
    })
    throw new Error(
      'No se pudo crear el plan en el proveedor de pagos. Inténtalo de nuevo en unos segundos.'
    )
  }
}

/**
 * Plain-JS shape the list and single-plan helpers return. Serialized
 * eagerly because Prisma's Decimal crashes the RSC serializer — the
 * vendor list page passes these rows straight to a client component.
 */
export interface SerializedSubscriptionPlanListRow {
  id: string
  vendorId: string
  productId: string
  cadence: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
  priceSnapshot: number
  taxRateSnapshot: number
  cutoffDayOfWeek: number
  stripePriceId: string | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  product: {
    id: string
    name: string
    slug: string
    images: string[]
    unit: string
  }
  // Aggregates surfaced on the vendor list for the "profesionalizado" header
  // & per-row stats. Phase 3 is vendor-only so these will be 0 until phase 4
  // flips the buyer-side beta flag, but the UI is ready for real data.
  activeSubscribersCount: number
  nextDeliveryAt: Date | null
}

type SubscriptionPlanListRowFromDb = Awaited<
  ReturnType<typeof db.subscriptionPlan.findFirst<{
    include: {
      product: {
        select: {
          id: true
          name: true
          slug: true
          images: true
          unit: true
        }
      }
    }
  }>>
>

function serializePlanListRow(
  row: NonNullable<SubscriptionPlanListRowFromDb>,
  aggregates: { activeSubscribersCount: number; nextDeliveryAt: Date | null } = {
    activeSubscribersCount: 0,
    nextDeliveryAt: null,
  },
): SerializedSubscriptionPlanListRow {
  return {
    id: row.id,
    vendorId: row.vendorId,
    productId: row.productId,
    cadence: row.cadence,
    priceSnapshot: Number(row.priceSnapshot),
    taxRateSnapshot: Number(row.taxRateSnapshot),
    cutoffDayOfWeek: row.cutoffDayOfWeek,
    stripePriceId: row.stripePriceId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    product: row.product,
    activeSubscribersCount: aggregates.activeSubscribersCount,
    nextDeliveryAt: aggregates.nextDeliveryAt,
  }
}

export async function listMySubscriptionPlans(
  filter: 'active' | 'archived' | 'all' = 'active'
): Promise<SerializedSubscriptionPlanListRow[]> {
  const { vendor } = await requireVendor()

  const rows = await db.subscriptionPlan.findMany({
    where: {
      vendorId: vendor.id,
      ...(filter === 'active' && { archivedAt: null }),
      ...(filter === 'archived' && { archivedAt: { not: null } }),
    },
    orderBy: [{ archivedAt: 'asc' }, { createdAt: 'desc' }],
    include: {
      product: {
        select: { id: true, name: true, slug: true, images: true, unit: true },
      },
    },
  })

  const planIds = rows.map(r => r.id)
  // Two small aggregates per plan: ACTIVE subscriber count (for the KPI
  // header and per-row stat) and the earliest nextDeliveryAt across active
  // subscriptions (for the "próxima entrega" hint). groupBy keeps this to
  // two queries instead of N.
  const [countsByPlan, earliestByPlan] = planIds.length
    ? await Promise.all([
        db.subscription.groupBy({
          by: ['planId'],
          where: { planId: { in: planIds }, status: 'ACTIVE' },
          _count: { _all: true },
        }),
        db.subscription.groupBy({
          by: ['planId'],
          where: { planId: { in: planIds }, status: 'ACTIVE' },
          _min: { nextDeliveryAt: true },
        }),
      ])
    : [[], []]

  const countMap = new Map(countsByPlan.map(c => [c.planId, c._count._all]))
  const nextMap = new Map(earliestByPlan.map(e => [e.planId, e._min.nextDeliveryAt ?? null]))

  return rows.map(row =>
    serializePlanListRow(row, {
      activeSubscribersCount: countMap.get(row.id) ?? 0,
      nextDeliveryAt: nextMap.get(row.id) ?? null,
    }),
  )
}

export interface VendorSubscriptionChurnStats {
  canceledThisMonth: number
  // Denominator for the simple rate the KPI card displays: active at the
  // start of the month + canceled during the month. This matches the
  // "rolling monthly churn" definition most SaaS dashboards show. Zero
  // means we don't have enough data yet — the UI renders a dash instead
  // of a misleading 0%.
  denominator: number
}

/**
 * Aggregates the vendor's monthly churn so the dashboard KPI card can show
 * "bajas este mes" alongside the active count. Computed in a single pair
 * of queries rather than looping over plans so it stays cheap as the
 * vendor scales.
 */
export async function getMyMonthlyChurnStats(): Promise<VendorSubscriptionChurnStats> {
  const { vendor } = await requireVendor()
  const now = new Date()
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  const [canceledThisMonth, stillActive] = await Promise.all([
    db.subscription.count({
      where: {
        plan: { vendorId: vendor.id },
        canceledAt: { gte: firstOfMonth },
      },
    }),
    db.subscription.count({
      where: {
        plan: { vendorId: vendor.id },
        status: { in: ['ACTIVE', 'PAUSED', 'PAST_DUE'] },
      },
    }),
  ])

  return {
    canceledThisMonth,
    denominator: stillActive + canceledThisMonth,
  }
}

export interface SerializedVendorSubscriber {
  id: string
  status: 'ACTIVE' | 'PAUSED' | 'CANCELED' | 'PAST_DUE'
  nextDeliveryAt: Date
  currentPeriodEnd: Date
  createdAt: Date
  buyer: {
    id: string
    firstName: string
    lastName: string
    email: string
  }
  shippingAddress: {
    id: string
    line1: string
    line2: string | null
    city: string
    province: string
    postalCode: string
    country: string
    phone: string | null
  }
  plan: {
    id: string
    cadence: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
    priceSnapshot: number
    product: { id: string; name: string; slug: string; unit: string }
  }
}

/**
 * Returns every subscription attached to one of the current vendor's plans
 * so they can see *who* to ship to, not just aggregate counts. Used by the
 * "Suscriptores" drill-down page linked from the vendor subscriptions
 * dashboard. Pass `planId` to scope to a single plan.
 */
export async function listMySubscribers(
  planId?: string,
): Promise<SerializedVendorSubscriber[]> {
  const { vendor } = await requireVendor()

  const rows = await db.subscription.findMany({
    where: {
      plan: { vendorId: vendor.id },
      ...(planId ? { planId } : {}),
      status: { in: ['ACTIVE', 'PAUSED', 'PAST_DUE'] },
    },
    orderBy: [{ status: 'asc' }, { nextDeliveryAt: 'asc' }],
    include: {
      buyer: { select: { id: true, firstName: true, lastName: true, email: true } },
      shippingAddress: {
        select: {
          id: true,
          line1: true,
          line2: true,
          city: true,
          province: true,
          postalCode: true,
          country: true,
          phone: true,
        },
      },
      plan: {
        select: {
          id: true,
          cadence: true,
          priceSnapshot: true,
          product: { select: { id: true, name: true, slug: true, unit: true } },
        },
      },
    },
  })

  return rows.map(row => ({
    id: row.id,
    status: row.status,
    nextDeliveryAt: row.nextDeliveryAt,
    currentPeriodEnd: row.currentPeriodEnd,
    createdAt: row.createdAt,
    buyer: row.buyer,
    shippingAddress: row.shippingAddress,
    plan: {
      id: row.plan.id,
      cadence: row.plan.cadence,
      priceSnapshot: Number(row.plan.priceSnapshot),
      product: row.plan.product,
    },
  }))
}

export async function getMySubscriptionPlan(planId: string) {
  const { vendor } = await requireVendor()
  const row = await db.subscriptionPlan.findFirst({
    where: { id: planId, vendorId: vendor.id },
    include: {
      product: { select: { id: true, name: true, slug: true } },
    },
  })
  if (!row) return null
  // Less-used single-row helper — return a serialized-enough shape too
  // so callers get a consistent type surface. Product is narrower here
  // than in the list helper (no images/unit) by design.
  return {
    id: row.id,
    vendorId: row.vendorId,
    productId: row.productId,
    cadence: row.cadence,
    priceSnapshot: Number(row.priceSnapshot),
    taxRateSnapshot: Number(row.taxRateSnapshot),
    cutoffDayOfWeek: row.cutoffDayOfWeek,
    stripePriceId: row.stripePriceId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    product: row.product,
  }
}

/**
 * Updates the editable fields of an existing plan. Only `cutoffDayOfWeek`
 * can change after creation: the product is locked by `@@unique(productId)`
 * and by the price snapshot (changing it would silently alter what past
 * subscribers agreed to), and the cadence is locked by the immutable
 * Stripe Price object provisioned at creation time. Archived plans cannot
 * be edited — reactivate first.
 */
const updateSubscriptionPlanSchema = z.object({
  cutoffDayOfWeek: z.coerce.number().int().min(0).max(6),
})

export async function updateSubscriptionPlan(
  planId: string,
  input: z.infer<typeof updateSubscriptionPlanSchema>,
) {
  const { vendor } = await requireVendor()
  const data = updateSubscriptionPlanSchema.parse(input)

  const plan = await db.subscriptionPlan.findFirst({
    where: { id: planId, vendorId: vendor.id },
    select: { id: true, archivedAt: true },
  })
  if (!plan) throw new Error('Plan de suscripción no encontrado')
  if (plan.archivedAt) {
    throw new Error('Reactiva el plan antes de editarlo')
  }

  const updated = await db.subscriptionPlan.update({
    where: { id: planId },
    data: { cutoffDayOfWeek: data.cutoffDayOfWeek },
  })

  safeRevalidatePath('/vendor/suscripciones')
  return updated
}

export async function archiveSubscriptionPlan(planId: string) {
  const { vendor } = await requireVendor()

  const plan = await db.subscriptionPlan.findFirst({
    where: { id: planId, vendorId: vendor.id },
    select: { id: true, archivedAt: true },
  })
  if (!plan) throw new Error('Plan de suscripción no encontrado')
  if (plan.archivedAt) return plan

  const updated = await db.subscriptionPlan.update({
    where: { id: planId },
    data: { archivedAt: new Date() },
  })

  safeRevalidatePath('/vendor/suscripciones')
  return updated
}

export async function unarchiveSubscriptionPlan(planId: string) {
  const { vendor } = await requireVendor()

  const plan = await db.subscriptionPlan.findFirst({
    where: { id: planId, vendorId: vendor.id },
    select: { id: true, archivedAt: true, productId: true },
  })
  if (!plan) throw new Error('Plan de suscripción no encontrado')
  if (!plan.archivedAt) return plan

  // The product may have been deleted / suspended since the plan was
  // archived. Refuse to reactivate in that case so a dead plan cannot
  // linger in the UI.
  const product = await db.product.findFirst({
    where: {
      id: plan.productId,
      vendorId: vendor.id,
      deletedAt: null,
      status: 'ACTIVE',
    },
    select: { id: true },
  })
  if (!product) {
    throw new Error(
      'El producto vinculado a este plan ya no está activo. Crea un plan nuevo desde un producto activo.'
    )
  }

  const updated = await db.subscriptionPlan.update({
    where: { id: planId },
    data: { archivedAt: null },
  })

  safeRevalidatePath('/vendor/suscripciones')
  return updated
}

/**
 * Loads a subscription that belongs to a plan owned by the current
 * vendor. Returns the full row needed by the lifecycle actions below.
 * Throws a generic 404-ish error if the vendor does not own the plan —
 * we deliberately do not leak "exists but not yours" vs "does not exist".
 */
async function loadVendorOwnedSubscription(subscriptionId: string, vendorId: string) {
  const sub = await db.subscription.findFirst({
    where: { id: subscriptionId, plan: { vendorId } },
    include: {
      plan: {
        select: {
          id: true,
          cadence: true,
          cutoffDayOfWeek: true,
          product: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!sub) throw new Error('Suscripción no encontrada')
  return sub
}

/**
 * Vendor-initiated "skip next delivery". Mirrors the buyer action but
 * scoped to subscriptions on one of the vendor's own plans. Use case:
 * the vendor has a supply issue on Friday (a hailstorm, a sick farmer,
 * a late delivery from their own supplier) and needs to push the drop
 * by one cadence without asking every buyer to click "skip" themselves.
 *
 * Same cutoff rule as the buyer action: we refuse once the cutoff day
 * for the week has passed, because by then the pack-and-ship cycle is
 * already in motion and an honest "skip" can't retroactively undo it.
 */
export async function skipNextDeliveryAsVendor(subscriptionId: string) {
  const { vendor } = await requireVendor()
  const sub = await loadVendorOwnedSubscription(subscriptionId, vendor.id)
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
    where: { id: subscriptionId },
    data: {
      skippedDeliveries: [...skipped, skippedDate],
      nextDeliveryAt: advancedNextDelivery,
      currentPeriodEnd: advancedPeriodEnd,
    },
  })
  safeRevalidatePath('/vendor/suscripciones/suscriptores')
  safeRevalidatePath('/vendor/suscripciones')
  return updated
}

/**
 * Vendor-initiated pause. Stops the delivery cycle until the vendor (or
 * the buyer) resumes. Intended for: the vendor goes on holiday, has a
 * broken production line, or otherwise can't fulfil for a while. The
 * buyer still sees their subscription as paused on their account.
 *
 * Mirrors the Stripe pause-collection logic from the buyer action.
 */
export async function pauseSubscriptionAsVendor(
  subscriptionId: string,
  duration: import('@/domains/subscriptions/pause-duration').PauseDuration = 'indefinite',
) {
  const { vendor } = await requireVendor()
  const sub = await loadVendorOwnedSubscription(subscriptionId, vendor.id)
  if (sub.status === 'CANCELED') {
    throw new Error('No se puede pausar una suscripción cancelada')
  }
  if (sub.status === 'PAUSED') return sub

  const { computePausedUntil } = await import('@/domains/subscriptions/pause-duration')
  const pausedUntil = computePausedUntil(duration)

  const updated = await db.subscription.update({
    where: { id: subscriptionId },
    data: { status: 'PAUSED', pausedUntil },
  })

  try {
    await pauseStripeSubscription(sub.stripeSubscriptionId)
  } catch (err) {
    console.error('[subscriptions] Stripe vendor-pause failed — local row is paused, Stripe will need manual reconcile', {
      subscriptionId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      error: err,
    })
  }

  safeRevalidatePath('/vendor/suscripciones/suscriptores')
  safeRevalidatePath('/vendor/suscripciones')
  return updated
}

/**
 * Vendor-initiated resume. Companion to pauseSubscriptionAsVendor so the
 * vendor can un-pause without asking the buyer. Resets nextDeliveryAt to
 * "one cadence from now" so the buyer gets the usual lead time, same
 * policy as the buyer-side resume.
 */
export async function resumeSubscriptionAsVendor(subscriptionId: string) {
  const { vendor } = await requireVendor()
  const sub = await loadVendorOwnedSubscription(subscriptionId, vendor.id)
  if (sub.status !== 'PAUSED') {
    throw new Error('Solo puedes reanudar una suscripción pausada')
  }

  // Lazy-load the cadence helper to avoid a circular import through
  // computeFirstDeliveryAt — actions.ts already imports the other
  // helpers from the same module so this is safe.
  const { computeFirstDeliveryAt } = await import('@/domains/subscriptions/cadence')
  const now = new Date()
  const nextDeliveryAt = computeFirstDeliveryAt(now, sub.plan.cadence)
  const currentPeriodEnd = computeCurrentPeriodEnd(nextDeliveryAt, sub.plan.cadence)

  const updated = await db.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: 'ACTIVE',
      nextDeliveryAt,
      currentPeriodEnd,
      pausedUntil: null,
    },
  })

  try {
    await resumeStripeSubscription(sub.stripeSubscriptionId)
  } catch (err) {
    console.error('[subscriptions] Stripe vendor-resume failed — local row is active, Stripe will need manual reconcile', {
      subscriptionId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      error: err,
    })
  }

  safeRevalidatePath('/vendor/suscripciones/suscriptores')
  safeRevalidatePath('/vendor/suscripciones')
  return updated
}
