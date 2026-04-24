import type PgBoss from 'pg-boss'
import { db } from '@/lib/db'
import { enqueue } from '@/lib/queue'
import {
  getTelegramProvider,
  INGESTION_JOB_KINDS,
  resolveIngestionRuntimeConfig,
  telegramSyncHandler,
  type IngestionSyncDb,
  type TelegramSyncJobData,
} from '@/domains/ingestion'

/**
 * Worker adapter: wires the pure `telegramSyncHandler` to the real
 * `db`, the env-selected provider, and the pg-boss queue. Kept tiny
 * on purpose so the integration surface is easy to audit.
 */

export async function runTelegramSyncJob(
  job: PgBoss.Job<TelegramSyncJobData>,
): Promise<void> {
  const config = resolveIngestionRuntimeConfig()
  const provider = getTelegramProvider()

  await telegramSyncHandler(job.data, {
    db: db as unknown as IngestionSyncDb,
    provider,
    enqueueMediaDownload: async ({ messageMediaId, fileUniqueId, correlationId }) => {
      await enqueue(
        INGESTION_JOB_KINDS.telegramMediaDownload,
        { messageMediaId, correlationId },
        { singletonKey: `media:${fileUniqueId}` },
      )
    },
    now: () => new Date(),
    batchSize: config.syncBatchSize,
  })
}
