import { isFeatureEnabled, type FlagContext } from '@/lib/flags'
import { logger } from '@/lib/logger'

/**
 * Kill switch and feature gate helpers for the Telegram ingestion
 * subsystem. Thin wrappers around `src/lib/flags.ts` that encode the
 * semantics Phase 1 ships with:
 *
 *   - `kill-ingestion-telegram` defaults to TRUE in PostHog, which in
 *     our fail-open model means the subsystem is KILLED by default.
 *     Operations proceed only when an operator has explicitly flipped
 *     the flag to FALSE for a target environment.
 *
 *   - `feat-ingestion-admin` defaults to FALSE. Admin UI and mutation
 *     actions resolve to "feature unavailable" until an operator opts
 *     in a specific admin user or role.
 *
 * These wrappers exist so call-sites can't accidentally drop the
 * "killed" reading or forget the structured log line that oncall uses
 * to trace rejected traffic.
 */

export const INGESTION_KILL_FLAG = 'kill-ingestion-telegram'
export const INGESTION_ADMIN_FEATURE_FLAG = 'feat-ingestion-admin'

export interface KillSwitchLogFields {
  correlationId?: string
  chatId?: string
  jobKind?: string
}

/**
 * Returns `true` when the kill switch is ENGAGED (subsystem killed).
 *
 * PostHog convention: the flag's evaluated value represents the
 * "kill is active" state, so `true` means killed. Fail-open behaviour
 * in `isFeatureEnabled` means a PostHog outage resolves to `true` as
 * well — during an outage we prefer to keep ingestion off rather than
 * run unsupervised.
 */
export async function isIngestionKilled(
  ctx?: FlagContext,
  log?: KillSwitchLogFields,
): Promise<boolean> {
  const killed = await isFeatureEnabled(INGESTION_KILL_FLAG, ctx)
  if (killed) {
    logger.info('ingestion.telegram.kill_switch_active', {
      flag: INGESTION_KILL_FLAG,
      correlationId: log?.correlationId,
      chatId: log?.chatId,
      jobKind: log?.jobKind,
    })
  }
  return killed
}

/**
 * Returns `true` when the admin-facing ingestion surface should be
 * visible and actionable for the given caller. Combine with an admin
 * role check — the flag alone is not an authorization decision.
 */
export async function isIngestionAdminEnabled(
  ctx?: FlagContext,
): Promise<boolean> {
  return isFeatureEnabled(INGESTION_ADMIN_FEATURE_FLAG, ctx)
}
