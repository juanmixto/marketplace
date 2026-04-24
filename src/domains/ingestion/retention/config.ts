/**
 * Retention policy for the Telegram ingestion subsystem.
 *
 * Phase 1 policy is deliberately conservative: raw messages and
 * downloaded media are **never** auto-deleted — they are the source
 * of truth for every downstream feature. The sweeper only trims
 * operational artefacts (sync-run history, job audit, failed media
 * rows that carry no useful payload) after a grace window.
 *
 * Policy (all windows env-overridable):
 *
 *   - `TelegramIngestionMessage`       — kept forever. Never swept.
 *   - `TelegramIngestionMessageMedia`  — DOWNLOADED rows kept forever;
 *                                        SOURCE_GONE / SKIPPED_OVERSIZE
 *                                        rows swept after N days
 *                                        (default 90); FAILED rows
 *                                        retained so operators can
 *                                        inspect.
 *   - `TelegramIngestionSyncRun`       — swept after N days
 *                                        (default 90).
 *   - `IngestionJob`                   — terminal rows (OK / FAILED /
 *                                        DEAD) swept after N days
 *                                        (default 30); QUEUED /
 *                                        RUNNING rows never swept.
 *   - `TelegramIngestionConnection` / `Chat` — never swept; disabling
 *     a chat is a manual operator action.
 *
 * Raising or lowering any value requires a Phase 6 policy review —
 * changing it silently can cause GDPR exposure (too lax) or loss of
 * forensic trail (too aggressive).
 */

export const DEFAULT_SYNC_RUN_RETENTION_DAYS = 90
export const DEFAULT_INGESTION_JOB_RETENTION_DAYS = 30
export const DEFAULT_FAILED_MEDIA_RETENTION_DAYS = 90
export const DEFAULT_SWEEP_BATCH_SIZE = 500
export const DEFAULT_SWEEP_MAX_DURATION_MS = 5 * 60 * 1000 // 5 minutes

export interface RetentionPolicy {
  syncRunRetentionDays: number
  ingestionJobRetentionDays: number
  failedMediaRetentionDays: number
  sweepBatchSize: number
  sweepMaxDurationMs: number
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  max: number | null = null,
): number {
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return fallback
  if (max !== null && n > max) return max
  return n
}

export function resolveRetentionPolicy(
  env: Record<string, string | undefined> = process.env,
): RetentionPolicy {
  return {
    syncRunRetentionDays: parsePositiveInt(
      env.INGESTION_SYNC_RUN_RETENTION_DAYS,
      DEFAULT_SYNC_RUN_RETENTION_DAYS,
      365 * 5,
    ),
    ingestionJobRetentionDays: parsePositiveInt(
      env.INGESTION_JOB_RETENTION_DAYS,
      DEFAULT_INGESTION_JOB_RETENTION_DAYS,
      365 * 5,
    ),
    failedMediaRetentionDays: parsePositiveInt(
      env.INGESTION_FAILED_MEDIA_RETENTION_DAYS,
      DEFAULT_FAILED_MEDIA_RETENTION_DAYS,
      365 * 5,
    ),
    sweepBatchSize: parsePositiveInt(
      env.INGESTION_SWEEP_BATCH_SIZE,
      DEFAULT_SWEEP_BATCH_SIZE,
      5_000,
    ),
    sweepMaxDurationMs: parsePositiveInt(
      env.INGESTION_SWEEP_MAX_DURATION_MS,
      DEFAULT_SWEEP_MAX_DURATION_MS,
      30 * 60 * 1000,
    ),
  }
}
