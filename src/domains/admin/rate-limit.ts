/**
 * Rate-limit guard for sensitive admin mutations (#1352, epic #1346).
 *
 * Wraps `checkRateLimit` with a mutation-specific error type and a
 * "near-limit" log so a noisy admin (or compromised account) is
 * visible in PostHog before it actually trips the bucket.
 *
 * Limits are intentionally generous for normal moderation work and
 * tight only for direct-money actions (refund). The point isn't to
 * slow legitimate ops — it's to prevent a 1000-rps loop from a stolen
 * admin cookie or a misconfigured CRON.
 */

import { checkRateLimit } from '@/lib/ratelimit'
import { logger } from '@/lib/logger'

export class AdminMutationRateLimitError extends Error {
  readonly status = 429
  readonly retryAfterSeconds: number
  constructor(scope: string, retryAfterSeconds: number) {
    super(
      `Has alcanzado el límite de operaciones de tipo "${scope}". Vuelve a intentarlo en ~${retryAfterSeconds}s.`,
    )
    this.name = 'AdminMutationRateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export interface AdminRateLimitConfig {
  scope: string
  actorId: string
  limit: number
  windowSeconds: number
}

/**
 * Throws `AdminMutationRateLimitError` when the bucket is exhausted.
 * Emits `admin.mutation.rate_warning` (logger.warn) when ≥ 80% of the
 * bucket is consumed but the call still succeeds. The warning is the
 * single signal PostHog / Sentry alerts should fire on; the 429 is
 * covered separately by the `ratelimit.exceeded` handler.
 */
export async function enforceAdminMutationRateLimit(
  config: AdminRateLimitConfig,
): Promise<void> {
  const { scope, actorId, limit, windowSeconds } = config
  const result = await checkRateLimit(
    `admin-mutation:${scope}`,
    actorId,
    limit,
    windowSeconds,
  )
  if (!result.success) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((result.resetAt - Date.now()) / 1000),
    )
    throw new AdminMutationRateLimitError(scope, retryAfterSeconds)
  }
  // remaining === 0 means this call WAS the last allowed one — counts
  // as ≥ 80% consumption for any practical limit. The threshold is
  // (limit - remaining) / limit ≥ 0.8.
  if ((limit - result.remaining) / limit >= 0.8) {
    logger.warn('admin.mutation.rate_warning', {
      scope,
      actorId,
      limit,
      remaining: result.remaining,
      windowSeconds,
    })
  }
}
