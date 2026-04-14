import type { SubscriptionCadence } from '@/generated/prisma/enums'

/**
 * Pure, timezone-neutral cadence math used by both the vendor plan CRUD
 * (phase 3) and the buyer subscription actions (phase 4a). Kept in its own
 * module so the unit tests can exercise the transitions without a DB or
 * a clock patch.
 *
 * All dates are in UTC for simplicity — the renewal webhook in phase 4b
 * will ultimately honor the buyer's local delivery window, but until then
 * "+7 days" is good enough for a preview and for the skip bookkeeping.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function advanceByCadence(
  from: Date,
  cadence: SubscriptionCadence
): Date {
  const daysByCadence: Record<SubscriptionCadence, number> = {
    WEEKLY:   7,
    BIWEEKLY: 14,
    // We model MONTHLY as 30 days for the phase 4a preview. Calendar-aware
    // month advancement (e.g. "always the 15th") can land with Stripe
    // Subscriptions in phase 4b — Stripe handles billing-cycle anchors
    // natively and we can delegate to it.
    MONTHLY:  30,
  }
  const days = daysByCadence[cadence]
  return new Date(from.getTime() + days * MS_PER_DAY)
}

/**
 * Computes the first delivery date for a brand-new subscription.
 * For now, the delivery lands one full cadence after creation. This gives
 * the vendor preparation time and the buyer a cooling-off window before
 * any charge. Phase 4b may tune this (e.g. "next Monday after today").
 */
export function computeFirstDeliveryAt(
  createdAt: Date,
  cadence: SubscriptionCadence
): Date {
  return advanceByCadence(createdAt, cadence)
}

/**
 * Computes the period end given the next delivery. Used to keep the
 * `currentPeriodEnd` column in sync with the buyer's view of "what am I
 * paying for and until when".
 */
export function computeCurrentPeriodEnd(
  nextDeliveryAt: Date,
  cadence: SubscriptionCadence
): Date {
  return advanceByCadence(nextDeliveryAt, cadence)
}

/**
 * Returns `true` iff the buyer is still allowed to skip / cancel the
 * next delivery given today's weekday and the vendor-defined cutoff
 * dayOfWeek (0 = Sunday … 6 = Saturday).
 *
 * Rule: the buyer can act on the upcoming delivery up until and including
 * the cutoff day of the week that contains that delivery. After that, the
 * delivery is "locked" and the action must apply to the *following* one.
 */
export function isBeforeCutoff(
  now: Date,
  nextDeliveryAt: Date,
  cutoffDayOfWeek: number
): boolean {
  if (now.getTime() >= nextDeliveryAt.getTime()) return false

  const nextDeliveryMs = nextDeliveryAt.getTime()
  const nowMs = now.getTime()

  // Find the most-recent cutoff-day-of-week strictly before nextDelivery.
  const nextDeliveryDow = nextDeliveryAt.getUTCDay()
  // Days to walk BACK from nextDelivery to hit the cutoff day. If the
  // cutoff day *is* the next delivery day, we treat the whole delivery
  // day itself as cutoff-day to keep the "you can act on the morning of"
  // semantics intuitive.
  let daysBack = (nextDeliveryDow - cutoffDayOfWeek + 7) % 7
  if (daysBack === 0) daysBack = 0 // same-day cutoff
  const cutoffInstant = new Date(nextDeliveryMs - daysBack * MS_PER_DAY)
  // Cutoff locks at end-of-day of the cutoff date.
  cutoffInstant.setUTCHours(23, 59, 59, 999)

  return nowMs <= cutoffInstant.getTime()
}
