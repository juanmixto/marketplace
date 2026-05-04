/**
 * Coupon attempt rate limiting (#1269).
 *
 * Brute-forcing `Promotion.code` was effectively free pre-launch: the
 * preview action returned a fast 'unknown' on miss with no per-IP /
 * per-session budget. A predictable code (`VERANO10`, `LAUNCH20`) could
 * be enumerated in minutes and burn margin directly.
 *
 * We rate-limit every attempt that includes a non-empty `code`, not
 * just the failed ones — checking only failures would leak validity
 * through behavior (the bucket would fire on miss but not on hit).
 *
 * Fail-open by design (no `failClosed`): if Upstash is unreachable, we
 * would rather let buyers redeem a legit code than break checkout. The
 * paired controls (Cloudflare WAF rules in #1273, HMAC-signed codes in
 * #1284) cover the gap if the rate-limiter is degraded.
 */

import { headers as nextHeaders } from 'next/headers'
import { checkRateLimit } from '@/lib/ratelimit'
import { extractAuditIp } from '@/lib/audit'
import { logger } from '@/lib/logger'

// Generous enough that a legit buyer who fat-fingers a code three times
// at checkout never hits it; tight enough that a brute-forcer pays a
// real cost. Tuned for pre-launch volume — revisit when we see traffic.
const COUPON_LIMIT_PER_IP = 30
const COUPON_LIMIT_PER_SESSION = 10
const COUPON_WINDOW_SECONDS = 3600

export interface CouponRateLimitInput {
  code: string | null | undefined
  /** Authenticated user id. `null` for guest / unauthenticated checkout. */
  buyerId: string | null
  /** Surface label for telemetry: 'preview' | 'checkout'. */
  surface: 'preview' | 'checkout'
}

export interface CouponRateLimitResult {
  allowed: boolean
  resetAt?: number
}

/**
 * Returns `{ allowed: false }` when the caller has exceeded the per-IP
 * or per-session budget. The caller decides how to surface the block —
 * the preview action returns an empty result, the order action throws
 * `InvalidPromotionCodeError`. Either way the bucket is the same.
 *
 * Returns `{ allowed: true }` when no code was supplied (browsing the
 * cart with no code is unmetered) or the budgets are not exhausted.
 */
export async function checkCouponAttemptRateLimit(
  input: CouponRateLimitInput
): Promise<CouponRateLimitResult> {
  const code = input.code?.trim()
  if (!code) return { allowed: true }

  const headerStore = await nextHeaders()
  const ip = extractAuditIp(headerStore) ?? 'unknown'

  const ipResult = await checkRateLimit(
    'coupon-attempt-ip',
    ip,
    COUPON_LIMIT_PER_IP,
    COUPON_WINDOW_SECONDS,
  )

  if (!ipResult.success) {
    logger.warn('coupon.attempt_blocked', {
      reason: 'ip',
      surface: input.surface,
      ip,
      buyerId: input.buyerId,
    })
    return { allowed: false, resetAt: ipResult.resetAt }
  }

  if (input.buyerId) {
    const sessionResult = await checkRateLimit(
      'coupon-attempt-session',
      input.buyerId,
      COUPON_LIMIT_PER_SESSION,
      COUPON_WINDOW_SECONDS,
    )
    if (!sessionResult.success) {
      logger.warn('coupon.attempt_blocked', {
        reason: 'session',
        surface: input.surface,
        ip,
        buyerId: input.buyerId,
      })
      return { allowed: false, resetAt: sessionResult.resetAt }
    }
  }

  return { allowed: true }
}
