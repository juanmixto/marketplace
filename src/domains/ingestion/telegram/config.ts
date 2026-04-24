/**
 * Runtime tunables for the Telegram ingestion jobs.
 *
 * Every knob is env-driven with a conservative default. Concurrency
 * is deliberately tiny in Phase 1 (1 worker per job kind, small batch,
 * 20 MB media cap) so an ingestion runaway cannot starve the web
 * database or blow up memory.
 *
 * Raising any of these values requires a Phase 6 review — see
 * docs/ingestion/telegram.md § Decisions log.
 */

export const DEFAULT_SYNC_BATCH_SIZE = 100
export const MAX_SYNC_BATCH_SIZE = 500
export const DEFAULT_SYNC_CONCURRENCY = 1
export const DEFAULT_MEDIA_CONCURRENCY = 1
export const DEFAULT_MEDIA_MAX_BYTES = 20 * 1024 * 1024 // 20 MB
export const DEFAULT_JOB_RETRY_LIMIT = 5

export interface IngestionRuntimeConfig {
  syncBatchSize: number
  syncConcurrency: number
  mediaConcurrency: number
  mediaMaxBytes: number
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

export function resolveIngestionRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): IngestionRuntimeConfig {
  return {
    syncBatchSize: parsePositiveInt(
      env.INGESTION_TELEGRAM_BATCH_SIZE,
      DEFAULT_SYNC_BATCH_SIZE,
      MAX_SYNC_BATCH_SIZE,
    ),
    syncConcurrency: parsePositiveInt(
      env.INGESTION_TELEGRAM_SYNC_CONCURRENCY,
      DEFAULT_SYNC_CONCURRENCY,
      4,
    ),
    mediaConcurrency: parsePositiveInt(
      env.INGESTION_TELEGRAM_MEDIA_CONCURRENCY,
      DEFAULT_MEDIA_CONCURRENCY,
      4,
    ),
    mediaMaxBytes: parsePositiveInt(
      env.INGESTION_TELEGRAM_MEDIA_MAX_BYTES,
      DEFAULT_MEDIA_MAX_BYTES,
      256 * 1024 * 1024,
    ),
  }
}
