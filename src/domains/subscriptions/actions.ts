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

  // Unique-by-product: a product already wired to a plan blocks a second
  // plan. The @@unique on productId would raise a P2002 error anyway, but
  // the explicit check yields a friendlier message.
  const existing = await db.subscriptionPlan.findUnique({
    where: { productId: data.productId },
    select: { id: true, archivedAt: true },
  })
  if (existing && !existing.archivedAt) {
    throw new Error('Este producto ya tiene un plan de suscripción activo')
  }
  if (existing && existing.archivedAt) {
    throw new Error(
      'Este producto tiene un plan archivado. Reactívalo desde la lista en lugar de crear uno nuevo.'
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
  // so the vendor can retry without hitting the @@unique([productId])
  // constraint.
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

export async function listMySubscriptionPlans(
  filter: 'active' | 'archived' | 'all' = 'active'
) {
  const { vendor } = await requireVendor()

  return db.subscriptionPlan.findMany({
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
}

export async function getMySubscriptionPlan(planId: string) {
  const { vendor } = await requireVendor()
  return db.subscriptionPlan.findFirst({
    where: { id: planId, vendorId: vendor.id },
    include: {
      product: { select: { id: true, name: true, slug: true } },
    },
  })
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
