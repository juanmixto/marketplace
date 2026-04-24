/**
 * Public types for the Telegram ingestion subsystem.
 *
 * Kept deliberately minimal in Phase 1: only raw-pipeline job kinds
 * and correlation ids. Extraction / draft / publishing types land in
 * later phases and will live in their own sub-modules.
 */

export const INGESTION_JOB_KINDS = {
  telegramSync: 'telegram.sync',
  telegramMediaDownload: 'telegram.mediaDownload',
} as const

export type IngestionJobKind =
  (typeof INGESTION_JOB_KINDS)[keyof typeof INGESTION_JOB_KINDS]

export interface TelegramSyncPayload {
  chatId: string
}

export interface TelegramMediaDownloadPayload {
  messageMediaId: string
}

export type IngestionJobPayload =
  | { kind: typeof INGESTION_JOB_KINDS.telegramSync; data: TelegramSyncPayload }
  | {
      kind: typeof INGESTION_JOB_KINDS.telegramMediaDownload
      data: TelegramMediaDownloadPayload
    }
