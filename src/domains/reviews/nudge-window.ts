/**
 * Decay rules for the review-pending nudges (hub banner + per-order pill).
 *
 * Background — the buyer told us:
 *   - "It feels like spam"
 *   - "If I bought it once it keeps asking forever"
 *
 * Rules:
 *   - Fresh window (≤ 14 days from order placement): full prominence.
 *   - Faded window (15–30 days): the pill renders in a subtle variant
 *     (no amber background fill, hairline border + small icon). The
 *     hub banner still shows IF there is at least one fresh order.
 *   - Stale (> 30 days): no nudges at all. The order is still reachable
 *     via the "Por valorar" tab — opt-in only.
 *
 * Plus a buyer-controlled snooze: tapping "Saltar todos" in the wizard
 * silences the banner + pill for 14 days. The snooze does not affect
 * the tab. Snooze state lives client-side in localStorage so the back-
 * end stays unchanged.
 */

export const REVIEW_NUDGE_FRESH_DAYS = 14
export const REVIEW_NUDGE_STALE_DAYS = 30
export const REVIEW_SNOOZE_DAYS = 14

export type NudgeIntensity = 'fresh' | 'faded' | 'stale'

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * How aggressively (if at all) we should nudge for an order based on its
 * placement date. `now` defaults to `new Date()` but is overridable so the
 * function is deterministic in tests.
 */
export function reviewNudgeIntensity(orderPlacedAt: Date | string, now: Date = new Date()): NudgeIntensity {
  const placed = orderPlacedAt instanceof Date ? orderPlacedAt : new Date(orderPlacedAt)
  const ageDays = (now.getTime() - placed.getTime()) / MS_PER_DAY
  if (ageDays <= REVIEW_NUDGE_FRESH_DAYS) return 'fresh'
  if (ageDays <= REVIEW_NUDGE_STALE_DAYS) return 'faded'
  return 'stale'
}

/** Whether the per-order pill should render at all (any fresh or faded). */
export function shouldShowOrderPill(orderPlacedAt: Date | string, now?: Date): boolean {
  return reviewNudgeIntensity(orderPlacedAt, now) !== 'stale'
}

/**
 * Whether the hub banner should render. Pass the placement dates of every
 * still-pending order. The banner shows only when at least one of them is
 * inside the fresh window — otherwise the buyer probably has stopped caring
 * about those reviews and we don't push.
 */
export function shouldShowHubBanner(pendingOrderDates: Array<Date | string>, now?: Date): boolean {
  return pendingOrderDates.some(d => reviewNudgeIntensity(d, now) === 'fresh')
}
