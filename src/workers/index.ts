/**
 * Worker entrypoint. Run with `npm run worker`.
 *
 * The worker is a separate Node process that shares the Postgres
 * instance (via pg-boss) with the web app but runs in its own
 * container / dyno. Heavy ingestion work lives here so the Next.js
 * request/response cycle stays untouched.
 *
 * PR-C registers two handlers:
 *
 *   - `telegram.sync`           — incremental pull for one chat
 *   - `telegram.mediaDownload`  — one media file per job
 *
 * Both handlers start with a `kill-ingestion-telegram` probe so a
 * flipped flag stops new work within a single poll cycle, with no
 * redeploy needed. Concurrency is configurable but defaults to 1 per
 * job kind, which is deliberately conservative — raising it requires
 * a Phase 6 review.
 */

import { getQueue, registerHandler, stopQueue } from '@/lib/queue'
import { logger } from '@/lib/logger'
import {
  INGESTION_JOB_KINDS,
  PROCESSING_JOB_KINDS,
  resolveIngestionRuntimeConfig,
  type TelegramMediaDownloadJobData,
  type TelegramSyncJobData,
} from '@/domains/ingestion'
import { runTelegramSyncJob } from './jobs/telegram-sync'
import { runTelegramMediaDownloadJob } from './jobs/telegram-media-download'
import {
  runProcessMessageJob,
  type ProcessMessageJobData,
} from './jobs/ingestion-processing'

async function main() {
  logger.info('worker.starting', {
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
    pid: process.pid,
  })

  const config = resolveIngestionRuntimeConfig()
  await getQueue()

  await registerHandler<TelegramSyncJobData>(
    INGESTION_JOB_KINDS.telegramSync,
    async (job) => {
      await runTelegramSyncJob(job)
    },
  )
  await registerHandler<TelegramMediaDownloadJobData>(
    INGESTION_JOB_KINDS.telegramMediaDownload,
    async (job) => {
      await runTelegramMediaDownloadJob(job)
    },
  )
  // Phase 2: deterministic processing pipeline (classifier + rules
  // extractor + drafts builder) run inline inside a single job per
  // raw message. The umbrella `kill-ingestion-processing` + the
  // `feat-ingestion-rules-extractor` stage flag both default to off,
  // so the handler is inert until operators opt in.
  await registerHandler<ProcessMessageJobData>(
    PROCESSING_JOB_KINDS.buildDrafts,
    async (job) => {
      await runProcessMessageJob(job)
    },
  )

  logger.info('worker.ready', {
    handlers: [
      INGESTION_JOB_KINDS.telegramSync,
      INGESTION_JOB_KINDS.telegramMediaDownload,
      PROCESSING_JOB_KINDS.buildDrafts,
    ],
    config,
  })

  const shutdown = async (signal: string) => {
    logger.info('worker.shutdown_signal', { signal })
    try {
      await stopQueue()
    } catch (err) {
      logger.error('worker.shutdown_error', { error: err })
    }
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  logger.error('worker.fatal', { error: err })
  process.exit(1)
})
