import type PgBoss from 'pg-boss'
import { db } from '@/lib/db'
import {
  getTelegramProvider,
  resolveIngestionRuntimeConfig,
  telegramMediaDownloadHandler,
  type IngestionSyncDb,
  type TelegramMediaDownloadJobData,
} from '@/domains/ingestion'
import { defaultMediaStore } from './telegram-media-store'

export async function runTelegramMediaDownloadJob(
  job: PgBoss.Job<TelegramMediaDownloadJobData>,
): Promise<void> {
  const config = resolveIngestionRuntimeConfig()
  const provider = getTelegramProvider()

  await telegramMediaDownloadHandler(job.data, {
    db: db as unknown as IngestionSyncDb,
    provider,
    store: defaultMediaStore,
    now: () => new Date(),
    mediaMaxBytes: config.mediaMaxBytes,
  })
}
