/**
 * Reconcile Stripe PaymentIntents against local Payment rows (#405).
 *
 * Rationale: persist-first (#404) eliminated the orphan-PI window for
 * new checkouts, but we can still end up with stale PENDING Payment
 * rows whose webhook was never delivered — network partition between
 * Stripe and our webhook endpoint, edge outage, a paused Stripe
 * account, etc. Without this sweeper those rows sit PENDING forever
 * and the matching Stripe PI expires silently after 24h.
 *
 * The sweeper is operator-triggered (`npm run reconcile:payments`),
 * not a cron, and idempotent — re-running is always safe because every
 * state transition is guarded (status: {not: target}).
 *
 * Mock-mode callers get a no-op with a log line: mock PIs never touch
 * Stripe so there's nothing to reconcile.
 */

import type { PrismaClient } from '@/generated/prisma/client'
import { getServerEnv } from '@/lib/env'
import { logger } from '@/lib/logger'

export type StripePaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'canceled'
  | 'succeeded'

export interface StripePaymentIntentSnapshot {
  id: string
  status: StripePaymentIntentStatus
  amount: number
  currency: string
}

/**
 * Minimal Stripe client surface we need, carved out so unit tests can
 * inject a fake without mocking the whole SDK.
 */
export interface StripePaymentIntentFetcher {
  retrieve(id: string): Promise<StripePaymentIntentSnapshot>
}

export type ReconcileDecision =
  | { action: 'mark_succeeded' }
  | { action: 'mark_failed'; reason: 'canceled' | 'requires_payment_method' }
  | { action: 'skip'; reason: 'still_pending' | 'mismatch_amount' }

export interface LocalPaymentSnapshot {
  providerRef: string
  amount: number
  currency: string
}

/**
 * Pure decision function — given what Stripe says vs. what we store,
 * pick the reconciliation action. Tested in isolation.
 *
 * `mismatch_amount` intentionally falls under `skip` rather than
 * `mark_failed`: this is exactly the same signal the webhook handler
 * flags as `stripe.webhook.payment_mismatch` and refuses to act on,
 * because an amount divergence suggests tampering or data drift — the
 * sweeper should NOT paper over that. The operator sees the warning in
 * the script output and escalates by hand.
 */
export function decideReconcileAction(
  local: LocalPaymentSnapshot,
  remote: StripePaymentIntentSnapshot,
): ReconcileDecision {
  if (remote.status === 'succeeded') {
    if (
      remote.amount !== Math.round(local.amount * 100)
      || remote.currency.toLowerCase() !== local.currency.toLowerCase()
    ) {
      return { action: 'skip', reason: 'mismatch_amount' }
    }
    return { action: 'mark_succeeded' }
  }

  if (remote.status === 'canceled') {
    return { action: 'mark_failed', reason: 'canceled' }
  }

  // requires_payment_method after a failed auth is Stripe's way of
  // saying "the card declined, please try again". From our perspective
  // this PI will never succeed; treat it as FAILED so the Order stops
  // sitting in PAYMENT_PENDING and the buyer can retry with a new
  // checkout attempt.
  if (remote.status === 'requires_payment_method') {
    return { action: 'mark_failed', reason: 'requires_payment_method' }
  }

  return { action: 'skip', reason: 'still_pending' }
}

export interface ReconcileCandidate {
  id: string
  providerRef: string
  orderId: string
  amount: number
  currency: string
  createdAt: Date
}

export interface ReconcileReport {
  reviewed: number
  markedSucceeded: number
  markedFailed: number
  skipped: number
  errors: number
}

/**
 * Run the sweeper. Safe to re-run; each state transition is guarded by
 * the current status so a concurrent webhook can't be double-applied.
 *
 * `olderThanMinutes` defaults to 60 — matches the Stripe PI "requires
 * confirmation" grace window and avoids racing with real-time webhook
 * delivery that might still be on its way.
 */
export async function reconcilePendingPayments({
  db,
  stripe,
  olderThanMinutes = 60,
  now = new Date(),
  limit = 500,
}: {
  db: PrismaClient
  stripe: StripePaymentIntentFetcher
  olderThanMinutes?: number
  now?: Date
  limit?: number
}): Promise<ReconcileReport> {
  const cutoff = new Date(now.getTime() - olderThanMinutes * 60 * 1000)

  const candidates = (await db.payment.findMany({
    where: {
      status: 'PENDING',
      providerRef: { not: null },
      createdAt: { lt: cutoff },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      providerRef: true,
      orderId: true,
      amount: true,
      currency: true,
      createdAt: true,
    },
  })) as Array<{
    id: string
    providerRef: string | null
    orderId: string
    amount: unknown
    currency: string
    createdAt: Date
  }>

  const report: ReconcileReport = {
    reviewed: candidates.length,
    markedSucceeded: 0,
    markedFailed: 0,
    skipped: 0,
    errors: 0,
  }

  for (const candidate of candidates) {
    if (!candidate.providerRef) continue
    const local: LocalPaymentSnapshot = {
      providerRef: candidate.providerRef,
      amount: Number(candidate.amount),
      currency: candidate.currency,
    }
    try {
      const remote = await stripe.retrieve(candidate.providerRef)
      const decision = decideReconcileAction(local, remote)

      if (decision.action === 'mark_succeeded') {
        await db.$transaction(async tx => {
          const pay = await tx.payment.updateMany({
            where: { id: candidate.id, status: { not: 'SUCCEEDED' } },
            data: { status: 'SUCCEEDED' },
          })
          const ord = await tx.order.updateMany({
            where: {
              id: candidate.orderId,
              OR: [
                { paymentStatus: { not: 'SUCCEEDED' } },
                { status: { not: 'PAYMENT_CONFIRMED' } },
              ],
            },
            data: { status: 'PAYMENT_CONFIRMED', paymentStatus: 'SUCCEEDED' },
          })
          if (pay.count > 0 || ord.count > 0) {
            await tx.orderEvent.create({
              data: {
                orderId: candidate.orderId,
                type: 'PAYMENT_CONFIRMED',
                payload: {
                  recordedAt: now.toISOString(),
                  providerRef: candidate.providerRef,
                  source: 'reconcile-script',
                  note: 'Confirmed by reconciliation sweep (#405), not webhook',
                },
              },
            })
          }
        })
        report.markedSucceeded += 1
        logger.info('payments.reconcile.marked_succeeded', {
          paymentId: candidate.id,
          orderId: candidate.orderId,
          providerRef: candidate.providerRef,
          ageMinutes: Math.round(
            (now.getTime() - candidate.createdAt.getTime()) / 60_000,
          ),
        })
        continue
      }

      if (decision.action === 'mark_failed') {
        await db.$transaction(async tx => {
          await tx.payment.updateMany({
            where: { id: candidate.id, status: 'PENDING' },
            data: { status: 'FAILED' },
          })
          await tx.order.updateMany({
            where: { id: candidate.orderId, paymentStatus: 'PENDING' },
            data: { paymentStatus: 'FAILED' },
          })
          await tx.orderEvent.create({
            data: {
              orderId: candidate.orderId,
              type: 'PAYMENT_FAILED',
              payload: {
                recordedAt: now.toISOString(),
                providerRef: candidate.providerRef,
                source: 'reconcile-script',
                reason: decision.reason,
              },
            },
          })
        })
        report.markedFailed += 1
        logger.info('payments.reconcile.marked_failed', {
          paymentId: candidate.id,
          orderId: candidate.orderId,
          providerRef: candidate.providerRef,
          reason: decision.reason,
        })
        continue
      }

      report.skipped += 1
      if (decision.reason === 'mismatch_amount') {
        logger.error('payments.reconcile.mismatch_amount', {
          paymentId: candidate.id,
          orderId: candidate.orderId,
          providerRef: candidate.providerRef,
          localAmount: local.amount,
          localCurrency: local.currency,
          remoteAmount: remote.amount,
          remoteCurrency: remote.currency,
        })
      } else {
        logger.info('payments.reconcile.still_pending', {
          paymentId: candidate.id,
          orderId: candidate.orderId,
          providerRef: candidate.providerRef,
          remoteStatus: remote.status,
        })
      }
    } catch (err) {
      report.errors += 1
      logger.error('payments.reconcile.error', {
        paymentId: candidate.id,
        providerRef: candidate.providerRef,
        error: err,
      })
    }
  }

  return report
}

/**
 * #1161 H-5 — recovery sweep for Orders that committed but never got a
 * PaymentIntent.
 *
 * `createOrder` runs the Order/Payment commit and the `createPaymentIntent`
 * call as separate steps (the PI call is intentionally OUTSIDE the
 * transaction because it talks to Stripe). If the Node process dies
 * between commit and PI creation — OOM, deploy rolling, kill -9 — we
 * end up with an Order at `paymentStatus=PENDING` whose Payment row has
 * `providerRef=null`. The original sweeper above doesn't see those (it
 * filters `providerRef: { not: null }`), and `markOrderPaymentIntentCreationFailed`
 * never ran (the process was dead), so stock and `Promotion.redemptionCount`
 * stay decremented forever.
 *
 * This sweeper restores those:
 *   1. Restock every line (Product.stock or ProductVariant.stock) the
 *      original transaction had decremented. Mirrors the trackStock /
 *      null-stock conditions of `reserveTrackedOrderLineStock`.
 *   2. Decrement every `Promotion.redemptionCount` that the create-order
 *      transaction had bumped (one per VendorFulfillment with a
 *      `promotionId`).
 *   3. Mark Order CANCELLED + paymentStatus=FAILED, free the
 *      `checkoutAttemptId` UNIQUE so the buyer can start a fresh
 *      attempt without colliding on the dedupe constraint.
 *   4. Mark Payment FAILED.
 *   5. Audit-log via OrderEvent `ORDER_ABANDONED_PRE_PI`.
 *
 * Idempotency: the sweep claims each candidate via a single
 * `updateMany({ where: { ... status: PENDING, providerRef: null }})`
 * before doing any work. `count === 0` means another sweeper or
 * concurrent process beat us to it; we exit cleanly.
 *
 * Cutoff: 30 minutes by default. Shorter than the 60m for the
 * succeeded/failed sweep because there is no remote service we are
 * waiting for — a PI was never created — so anything older than the
 * checkout-page timeout is safe to revert.
 */
export interface ReconcileAbandonedReport {
  reviewed: number
  reverted: number
  skipped: number
  errors: number
}

export async function reconcileAbandonedOrders({
  db,
  olderThanMinutes = 30,
  now = new Date(),
  limit = 200,
}: {
  db: PrismaClient
  olderThanMinutes?: number
  now?: Date
  limit?: number
}): Promise<ReconcileAbandonedReport> {
  const cutoff = new Date(now.getTime() - olderThanMinutes * 60 * 1000)

  const orphans = await db.payment.findMany({
    where: {
      status: 'PENDING',
      providerRef: null,
      createdAt: { lt: cutoff },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true, orderId: true, createdAt: true },
  })

  const report: ReconcileAbandonedReport = {
    reviewed: orphans.length,
    reverted: 0,
    skipped: 0,
    errors: 0,
  }

  for (const orphan of orphans) {
    try {
      const reverted = await db.$transaction(async tx => {
        // Atomic claim — if another sweeper already grabbed it, count===0 and we no-op.
        const claim = await tx.payment.updateMany({
          where: { id: orphan.id, status: 'PENDING', providerRef: null },
          data: { status: 'FAILED' },
        })
        if (claim.count === 0) return false

        // Restock. Mirrors create-order's reserveTrackedOrderLineStock:
        // only products with `trackStock=true` were decremented, and
        // variants with `stock=null` were skipped.
        const lines = await tx.orderLine.findMany({
          where: { orderId: orphan.orderId },
          select: { productId: true, variantId: true, quantity: true },
        })
        const productIds = [...new Set(lines.map(l => l.productId))]
        const products = productIds.length === 0
          ? []
          : await tx.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, trackStock: true },
          })
        const trackByProductId = new Map(products.map(p => [p.id, p.trackStock]))

        for (const line of lines) {
          if (!trackByProductId.get(line.productId)) continue
          if (line.variantId) {
            const variant = await tx.productVariant.findUnique({
              where: { id: line.variantId },
              select: { stock: true },
            })
            if (variant?.stock != null) {
              await tx.productVariant.update({
                where: { id: line.variantId },
                data: { stock: { increment: line.quantity } },
              })
            }
          } else {
            await tx.product.update({
              where: { id: line.productId },
              data: { stock: { increment: line.quantity } },
            })
          }
        }

        // Promotion redemption restitution. Each VendorFulfillment row
        // with a non-null promotionId mapped to one redemptionCount
        // bump in claimPromotionRedemptions during checkout.
        const fulfillments = await tx.vendorFulfillment.findMany({
          where: { orderId: orphan.orderId, promotionId: { not: null } },
          select: { promotionId: true },
        })
        for (const f of fulfillments) {
          if (!f.promotionId) continue
          await tx.promotion.update({
            where: { id: f.promotionId },
            data: { redemptionCount: { decrement: 1 } },
          })
        }

        await tx.order.update({
          where: { id: orphan.orderId },
          data: {
            status: 'CANCELLED',
            paymentStatus: 'FAILED',
            checkoutAttemptId: null,
          },
        })

        await tx.orderEvent.create({
          data: {
            orderId: orphan.orderId,
            type: 'ORDER_ABANDONED_PRE_PI',
            payload: {
              recordedAt: now.toISOString(),
              source: 'reconcile-script',
              reason: 'Order committed but createPaymentIntent never linked a providerRef',
              ageMinutes: Math.round((now.getTime() - orphan.createdAt.getTime()) / 60_000),
            },
          },
        })
        return true
      })

      if (reverted) {
        report.reverted += 1
        logger.info('payments.reconcile.orphan_reverted', {
          paymentId: orphan.id,
          orderId: orphan.orderId,
          ageMinutes: Math.round((now.getTime() - orphan.createdAt.getTime()) / 60_000),
        })
      } else {
        report.skipped += 1
      }
    } catch (err) {
      report.errors += 1
      logger.error('payments.reconcile.orphan_error', {
        paymentId: orphan.id,
        orderId: orphan.orderId,
        error: err,
      })
    }
  }

  return report
}

/**
 * Build a fetcher backed by the real Stripe SDK. Separate factory so
 * tests can skip the SDK import entirely.
 */
export async function makeStripeFetcher(): Promise<StripePaymentIntentFetcher | null> {
  const env = getServerEnv()
  if (env.paymentProvider !== 'stripe') return null
  const Stripe = (await import('stripe')).default
  const client = new Stripe(env.stripeSecretKey!)
  return {
    async retrieve(id) {
      const pi = await client.paymentIntents.retrieve(id)
      return {
        id: pi.id,
        status: pi.status as StripePaymentIntentStatus,
        amount: pi.amount,
        currency: pi.currency,
      }
    },
  }
}
