import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'

/**
 * Phase 5 admin read-only overview for subscriptions. Gathers the
 * high-level health metrics the platform team watches: active plans,
 * active subscriptions, MRR estimate (based on snapshot price + cadence
 * normalized to a monthly figure), and churn this month (canceled in
 * the current calendar month over active at the start of the month).
 */

export interface SubscriptionPlanRow {
  id: string
  cadence: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
  priceSnapshot: number
  archivedAt: Date | null
  createdAt: Date
  product: { id: string; name: string; slug: string }
  vendor: { id: string; slug: string; displayName: string }
  activeSubscriberCount: number
}

export interface ActiveSubscriptionRow {
  id: string
  status: 'ACTIVE' | 'PAUSED' | 'CANCELED' | 'PAST_DUE'
  createdAt: Date
  nextDeliveryAt: Date
  buyerEmail: string | null
  plan: {
    id: string
    cadence: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
    priceSnapshot: number
    productName: string
    vendorName: string
  }
}

export interface SubscriptionsOverview {
  kpis: {
    activePlans: number
    archivedPlans: number
    activeSubscriptions: number
    pastDueSubscriptions: number
    mrrEstimateEur: number
    churnRatePct: number
  }
  plans: SubscriptionPlanRow[]
  subscriptions: ActiveSubscriptionRow[]
}

const CADENCE_TO_MONTHLY_MULTIPLIER: Record<
  'WEEKLY' | 'BIWEEKLY' | 'MONTHLY',
  number
> = {
  // Normalize every cadence to a monthly contribution so MRR is
  // comparable across plans. Matches Stripe's own MRR convention.
  WEEKLY:   52 / 12, // ≈ 4.333
  BIWEEKLY: 26 / 12, // ≈ 2.166
  MONTHLY:  1,
}

export async function getSubscriptionsOverview(): Promise<SubscriptionsOverview> {
  await requireAdmin()
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    activePlansCount,
    archivedPlansCount,
    activeSubsCount,
    pastDueSubsCount,
    plans,
    subs,
    activeAtMonthStart,
    canceledThisMonth,
  ] = await Promise.all([
    db.subscriptionPlan.count({ where: { archivedAt: null } }),
    db.subscriptionPlan.count({ where: { archivedAt: { not: null } } }),
    db.subscription.count({ where: { status: { in: ['ACTIVE', 'PAUSED'] } } }),
    db.subscription.count({ where: { status: 'PAST_DUE' } }),
    db.subscriptionPlan.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        product: { select: { id: true, name: true, slug: true } },
        vendor:  { select: { id: true, slug: true, displayName: true } },
        _count: {
          select: {
            subscriptions: {
              where: { status: { in: ['ACTIVE', 'PAUSED'] } },
            },
          },
        },
      },
    }),
    db.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'PAUSED', 'PAST_DUE'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        buyer: { select: { email: true } },
        plan: {
          select: {
            id: true,
            cadence: true,
            priceSnapshot: true,
            product: { select: { name: true } },
            vendor: { select: { displayName: true } },
          },
        },
      },
    }),
    db.subscription.count({
      where: {
        createdAt: { lt: startOfMonth },
        OR: [
          { canceledAt: null },
          { canceledAt: { gte: startOfMonth } },
        ],
      },
    }),
    db.subscription.count({
      where: {
        canceledAt: { gte: startOfMonth },
      },
    }),
  ])

  // MRR estimate: for every ACTIVE / PAUSED / PAST_DUE sub, take the
  // plan's priceSnapshot and multiply by the cadence's monthly factor.
  // PAUSED is included because the buyer is still on the plan — the
  // pause is usually a few weeks, not a churn signal.
  const mrrSubs = await db.subscription.findMany({
    where: { status: { in: ['ACTIVE', 'PAUSED'] } },
    select: { plan: { select: { priceSnapshot: true, cadence: true } } },
  })
  const mrrCents = mrrSubs.reduce((acc, row) => {
    const price = Number(row.plan.priceSnapshot)
    const multiplier = CADENCE_TO_MONTHLY_MULTIPLIER[row.plan.cadence]
    return acc + Math.round(price * multiplier * 100)
  }, 0)

  const churnRatePct =
    activeAtMonthStart > 0
      ? Math.round((canceledThisMonth / activeAtMonthStart) * 100 * 10) / 10
      : 0

  return {
    kpis: {
      activePlans: activePlansCount,
      archivedPlans: archivedPlansCount,
      activeSubscriptions: activeSubsCount,
      pastDueSubscriptions: pastDueSubsCount,
      mrrEstimateEur: Math.round(mrrCents) / 100,
      churnRatePct,
    },
    plans: plans.map(plan => ({
      id: plan.id,
      cadence: plan.cadence,
      priceSnapshot: Number(plan.priceSnapshot),
      archivedAt: plan.archivedAt,
      createdAt: plan.createdAt,
      product: plan.product,
      vendor: plan.vendor,
      activeSubscriberCount: plan._count.subscriptions,
    })),
    subscriptions: subs.map(sub => ({
      id: sub.id,
      status: sub.status,
      createdAt: sub.createdAt,
      nextDeliveryAt: sub.nextDeliveryAt,
      buyerEmail: sub.buyer.email ?? null,
      plan: {
        id: sub.plan.id,
        cadence: sub.plan.cadence,
        priceSnapshot: Number(sub.plan.priceSnapshot),
        productName: sub.plan.product.name,
        vendorName: sub.plan.vendor.displayName,
      },
    })),
  }
}
