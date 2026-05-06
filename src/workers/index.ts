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

import { getQueue, registerHandler, scheduleRecurring, stopQueue } from '@/lib/queue'
import { logger } from '@/lib/logger'
import {
  INGESTION_JOB_KINDS,
  PROCESSING_JOB_KINDS,
  resolveIngestionRuntimeConfig,
  type TelegramMediaDownloadJobData,
  type TelegramSyncJobData,
} from '@/domains/ingestion'
import { runIngestionRawJsonSweep } from './jobs/ingestion-rawjson-sweep'
import { runTelegramSyncJob } from './jobs/telegram-sync'
import { runTelegramMediaDownloadJob } from './jobs/telegram-media-download'
import {
  runProcessMessageJob,
  type ProcessMessageJobData,
} from './jobs/ingestion-processing'
import { runDedupeJob, type DedupeJobData } from './jobs/ingestion-dedupe'
import {
  runUnextractableDedupeJob,
  type UnextractableDedupeJobData,
} from './jobs/ingestion-unextractable-dedupe'
import {
  PREWARM_IMAGE_VARIANTS_JOB,
  runPrewarmImageVariantsJob,
  type PrewarmImageVariantsJobData,
} from './jobs/prewarm-image-variants'
import { DLQ_ALERT_CRON, DLQ_ALERT_JOB, runDlqAlertJob } from './jobs/dlq-alert'
import {
  CLEANUP_ABANDONED_CRON,
  CLEANUP_ABANDONED_JOB,
  runCleanupAbandonedJob,
} from './jobs/cleanup-abandoned'

const RAWJSON_SWEEP_JOB = 'ingestion.telegram.rawjson-sweep'
const RAWJSON_SWEEP_CRON = '0 3 * * *'

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
  //
  // Pure CPU + Postgres + idempotent on (messageId, extractorVersion):
  // safe to parallelise. INGESTION_PROCESSING_CONCURRENCY (default 1,
  // max 8) lets operators drain backlog faster without touching the
  // sync handler, which still talks to rate-limited Telegram and
  // stays at concurrency 1.
  // pg-boss v10 expresses concurrency through batchSize (jobs per
  // poll) — the queue.ts wrapper runs the batch with Promise.all,
  // so batchSize=N is N concurrent in-flight jobs.
  const processingWorkOpts = {
    batchSize: config.processingConcurrency,
    pollingIntervalSeconds: config.processingPollingSeconds,
  }
  await registerHandler<ProcessMessageJobData>(
    PROCESSING_JOB_KINDS.buildDrafts,
    async (job) => {
      await runProcessMessageJob(job)
    },
    processingWorkOpts,
  )
  await registerHandler<DedupeJobData>(
    PROCESSING_JOB_KINDS.dedupeDrafts,
    async (job) => {
      await runDedupeJob(job)
    },
    processingWorkOpts,
  )
  // rules-1.2.0: unextractable dedupe runs after UNEXTRACTABLE
  // builder outcomes. Same stage flag (`feat-ingestion-dedupe`)
  // controls both product-draft and unextractable dedupe.
  await registerHandler<UnextractableDedupeJobData>(
    PROCESSING_JOB_KINDS.unextractableDedupe,
    async (job) => {
      await runUnextractableDedupeJob(job)
    },
    processingWorkOpts,
  )

  // #1052: prewarm /_next/image variants on upload. The handler is
  // pure I/O against the same Next instance, so a small batchSize is
  // safe — running 4 jobs in parallel keeps a publish burst snappy
  // without overwhelming the image optimizer.
  await registerHandler<PrewarmImageVariantsJobData>(
    PREWARM_IMAGE_VARIANTS_JOB,
    async (job) => {
      await runPrewarmImageVariantsJob(job)
    },
    { batchSize: 4 },
  )

  await registerHandler(RAWJSON_SWEEP_JOB, async () => {
    await runIngestionRawJsonSweep()
  })
  await scheduleRecurring(RAWJSON_SWEEP_JOB, { cron: RAWJSON_SWEEP_CRON })

  // #1213: webhook DLQ alerting tick — every 15 minutes, no payload.
  // Handler registration must come BEFORE the schedule so the first
  // tick lands on a registered handler instead of a queue with no
  // worker (which would silently no-op and leave operators thinking
  // the cron is broken).
  await registerHandler(DLQ_ALERT_JOB, async () => {
    await runDlqAlertJob()
  })
  await scheduleRecurring(DLQ_ALERT_JOB, { cron: DLQ_ALERT_CRON })

  // #1285: nightly cleanup of expired ephemeral state (auth tokens
  // past expiresAt). Same registration ordering as DLQ — handler
  // first, schedule second, so the first tick lands on a registered
  // worker.
  await registerHandler(CLEANUP_ABANDONED_JOB, async () => {
    await runCleanupAbandonedJob()
  })
  await scheduleRecurring(CLEANUP_ABANDONED_JOB, { cron: CLEANUP_ABANDONED_CRON })

  logger.info('worker.ready', {
    handlers: [
      INGESTION_JOB_KINDS.telegramSync,
      INGESTION_JOB_KINDS.telegramMediaDownload,
      PROCESSING_JOB_KINDS.buildDrafts,
      PROCESSING_JOB_KINDS.dedupeDrafts,
      PROCESSING_JOB_KINDS.unextractableDedupe,
      PREWARM_IMAGE_VARIANTS_JOB,
      RAWJSON_SWEEP_JOB,
      DLQ_ALERT_JOB,
      CLEANUP_ABANDONED_JOB,
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
