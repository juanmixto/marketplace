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
