/**
 * Public barrel for the Telegram ingestion subsystem.
 *
 * Cross-domain callers MUST import from this file only. Deep imports
 * into `./telegram/*`, `./raw/*`, etc. are rejected by
 * `scripts/audit-domain-contracts.mjs`.
 *
 * Phase 1 surface is intentionally narrow: types, flag helpers, the
 * admin authz guard. No actions or queries are re-exported yet — they
 * land in PR-B (provider + sidecar) and PR-C (sync pipeline).
 */

export {
  INGESTION_JOB_KINDS,
  type IngestionJobKind,
  type IngestionJobPayload,
  type TelegramSyncPayload,
  type TelegramMediaDownloadPayload,
} from './types'

export {
  INGESTION_KILL_FLAG,
  INGESTION_ADMIN_FEATURE_FLAG,
  isIngestionKilled,
  isIngestionAdminEnabled,
} from './flags'

export {
  requireIngestionAdmin,
  IngestionFeatureUnavailableError,
} from './authz'

// Runtime tunables (batch size, concurrency, media cap).
export {
  DEFAULT_SYNC_BATCH_SIZE,
  MAX_SYNC_BATCH_SIZE,
  DEFAULT_SYNC_CONCURRENCY,
  DEFAULT_MEDIA_CONCURRENCY,
  DEFAULT_MEDIA_MAX_BYTES,
  DEFAULT_JOB_RETRY_LIMIT,
  resolveIngestionRuntimeConfig,
  type IngestionRuntimeConfig,
} from './telegram/config'

// Retention policy + sweeper.
export {
  DEFAULT_SYNC_RUN_RETENTION_DAYS,
  DEFAULT_INGESTION_JOB_RETENTION_DAYS,
  DEFAULT_FAILED_MEDIA_RETENTION_DAYS,
  DEFAULT_SWEEP_BATCH_SIZE,
  DEFAULT_SWEEP_MAX_DURATION_MS,
  resolveRetentionPolicy,
  runRetentionSweep,
  type RetentionPolicy,
  type SweeperDb,
  type SweeperDeps,
  type SweepProgress,
  type SweepResult,
} from './retention'

// Job handlers — pure functions exported so tests can drive them
// with fakes, and the worker wires them with real dependencies.
export {
  telegramSyncHandler,
  telegramMediaDownloadHandler,
  MediaOversizeError,
  type TelegramSyncDeps,
  type TelegramSyncOutcome,
  type TelegramMediaDownloadDeps,
  type TelegramMediaDownloadOutcome,
  type TelegramSyncJobData,
  type TelegramMediaDownloadJobData,
  type IngestionSyncDb,
  type MediaStoreFn,
  type MediaStoreResult,
  type ChatWithConnection,
  type MessageMediaWithMessage,
} from './telegram/jobs'

// Provider layer — types + factory + typed error taxonomy. The worker
// imports `getTelegramProvider` to obtain the configured client;
// business code only needs the types for DTO shapes and the error
// classes for `instanceof` dispatch.
export {
  type TelegramIngestionProvider,
  type TelegramIngestionProviderCode,
  type RawTelegramChat,
  type RawTelegramMessage,
  type RawTelegramMessageMedia,
  type FetchChatsInput,
  type FetchChatsResult,
  type FetchMessagesInput,
  type FetchMessagesResult,
  type FetchMediaInput,
  type FetchMediaResult,
  type MockFixture,
  type TelethonHttpProviderConfig,
  createMockProvider,
  createTelethonHttpProvider,
  getTelegramProvider,
  resolveProviderCode,
  TELEGRAM_PROVIDER_ENV,
  TelegramProviderConfigError,
  TelegramProviderError,
  TelegramTransportError,
  TelegramBadResponseError,
  TelegramAuthRequiredError,
  TelegramFloodWaitError,
  TelegramChatGoneError,
} from './telegram/providers'
