import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { createPaymentConfirmedEventPayload } from '@/domains/orders/order-event-payload'
import { assertOrderTransition } from '@/domains/orders/state-machine'

/**
 * Centralizes the payment persistence writes that need to stay in sync with
 * the order lifecycle.
 */
export async function markOrderPaymentIntentCreationFailed(
  orderId: string,
  _paymentError: unknown
): Promise<void> {
  await db.payment.updateMany({
    where: { orderId, providerRef: null, status: 'PENDING' },
    data: { status: 'FAILED' },
  })
  await db.order.updateMany({
    where: { id: orderId, paymentStatus: 'PENDING' },
    data: { paymentStatus: 'FAILED' },
  })
}

/**
 * #1169 H-9: outcome of `linkOrderPaymentProviderRef`.
 *
 * - `linked`: the canonical happy path — exactly one Payment row went
 *   from `(providerRef=null, status=PENDING)` to the supplied `providerRef`.
 * - `idempotent_match`: the row already had this providerRef. Caused
 *   by Stripe returning the same PI for a retry that re-uses the
 *   `idempotencyKey = orderId` pattern — safe to continue.
 * - `diverged`: the row already has a *different* providerRef. The
 *   buyer's session would now point at a PI that does not match the
 *   one Stripe holds. Continuing would lose the next webhook to the
 *   dead-letter queue. Caller MUST abort and surface a retry to the
 *   buyer (which generates a fresh `checkoutAttemptId`).
 * - `missing`: no Payment row matched the orderId at all. Indicates
 *   schema drift or a deletion racing with checkout — also a hard
 *   abort.
 */
export type LinkOrderPaymentProviderRefResult =
  | { kind: 'linked' }
  | { kind: 'idempotent_match'; existingProviderRef: string }
  | { kind: 'diverged'; existingProviderRef: string }
  | { kind: 'missing' }

export async function linkOrderPaymentProviderRef(
  orderId: string,
  providerRef: string
): Promise<LinkOrderPaymentProviderRefResult> {
  const linked = await db.payment.updateMany({
    where: { orderId, providerRef: null, status: 'PENDING' },
    data: { providerRef },
  })

  if (linked.count === 1) {
    return { kind: 'linked' }
  }

  // Either the row was already linked (idempotent retry) or somehow
  // doesn't exist. Re-read to disambiguate so the caller can decide
  // whether to continue or abort. We accept any status here because a
  // linked row from a previous attempt may have already moved out of
  // PENDING (e.g. the webhook fired between the retry attempts).
  const existing = await db.payment.findFirst({
    where: { orderId },
    select: { providerRef: true },
  })

  if (!existing) {
    return { kind: 'missing' }
  }
  if (existing.providerRef === providerRef) {
    return { kind: 'idempotent_match', existingProviderRef: providerRef }
  }
  return {
    kind: 'diverged',
    existingProviderRef: existing.providerRef ?? '',
  }
}

export async function recordManualPaymentConfirmation(
  tx: Prisma.TransactionClient,
  orderId: string,
  providerRef: string
): Promise<{ paymentUpdated: number; orderUpdated: number }> {
  // Positive filters (= single legal predecessor) rather than `{ not: ... }`:
  //
  // With `status: { not: SUCCEEDED }`, two concurrent confirm calls for the
  // same order can both pass the filter, both enter updateMany, and both
  // flip Payment + Order + write an OrderEvent — producing duplicate audit
  // rows even when the mutation is self-idempotent. Anchoring the `where`
  // on the single allowed predecessor (`PENDING` → `SUCCEEDED`,
  // `PLACED` → `PAYMENT_CONFIRMED`) makes the transition a single serialised
  // edge: only the winning transaction matches, the second is a no-op.
  //
  // Symmetric with the webhook-side guard in
  // src/app/api/webhooks/stripe/route.ts (see PR #711).
  const paymentUpdate = await tx.payment.updateMany({
    where: { orderId, providerRef, status: 'PENDING' },
    data: { status: 'SUCCEEDED' },
  })
  assertOrderTransition('PLACED', 'PAYMENT_CONFIRMED')
  const orderUpdate = await tx.order.updateMany({
    where: { id: orderId, status: 'PLACED' },
    data: { status: 'PAYMENT_CONFIRMED', paymentStatus: 'SUCCEEDED' },
  })

  if (paymentUpdate.count > 0 || orderUpdate.count > 0) {
    await tx.orderEvent.create({
      data: {
        orderId,
        type: 'PAYMENT_CONFIRMED',
        payload: createPaymentConfirmedEventPayload({ providerRef, source: 'manual-confirm' }),
      },
    })
  }

  return {
    paymentUpdated: paymentUpdate.count,
    orderUpdated: orderUpdate.count,
  }
}
