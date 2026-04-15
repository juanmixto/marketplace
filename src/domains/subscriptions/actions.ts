'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { isVendor } from '@/lib/roles'
import { safeRevalidatePath } from '@/lib/revalidate'
import { provisionPlanPrice } from '@/domains/subscriptions/stripe-subscriptions'

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

const SUBSCRIPTION_CADENCES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const

function cadenceLabel(cadence: (typeof SUBSCRIPTION_CADENCES)[number]): string {
  if (cadence === 'WEEKLY') return 'semanal'
  if (cadence === 'BIWEEKLY') return 'quincenal'
  return 'mensual'
}

const subscriptionPlanSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  cadence: z.enum(SUBSCRIPTION_CADENCES),
  cutoffDayOfWeek: z.coerce.number().int().min(0).max(6),
})

export type SubscriptionPlanInput = z.infer<typeof subscriptionPlanSchema>

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
