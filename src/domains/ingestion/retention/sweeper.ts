import { logger } from '@/lib/logger'
import { generateCorrelationId } from '@/lib/correlation'
import type { RetentionPolicy } from './config'

/**
 * Idempotent, batch-based sweeper for ingestion operational data.
 *
 * Safety invariants:
 *
 *   1. **Batch-based.** Each delete is a bounded `take` + `deleteMany`
 *      pair. Long locks are impossible; the longest-held row lock is
 *      the time to delete ≤ `batchSize` rows.
 *   2. **Wall-clock cap.** If `sweepMaxDurationMs` elapses mid-run,
 *      the sweeper returns without touching the next batch. A later
 *      invocation picks up where it left off — deletes are permanent
 *      and never double-counted.
 *   3. **Cancelable.** An optional `AbortSignal` stops the loop between
 *      batches. Already-deleted rows stay deleted; no transaction
 *      spans two iterations.
 *   4. **Never touches source-of-truth.** `TelegramIngestionMessage`
 *      rows and DOWNLOADED media rows are out of scope. If a sweep
 *      target is ever added that could delete real content, it
 *      requires an explicit operator flag.
 *   5. **Respects dependent state.** IngestionJob rows in non-terminal
 *      states (QUEUED / RUNNING) are never deleted, even if older than
 *      the retention window.
 */

const LOG_SCOPE = 'ingestion.retention.sweep'

export interface SweeperDb {
  telegramIngestionSyncRun: {
    findMany(args: {
      where: { startedAt: { lt: Date } }
      select: { id: true }
      take: number
    }): Promise<Array<{ id: string }>>
    deleteMany(args: {
      where: { id: { in: string[] } }
    }): Promise<{ count: number }>
  }
  ingestionJob: {
    findMany(args: {
      where: {
        status: { in: Array<'OK' | 'FAILED' | 'DEAD'> }
        finishedAt: { lt: Date }
      }
      select: { id: true }
      take: number
    }): Promise<Array<{ id: string }>>
    deleteMany(args: {
      where: { id: { in: string[] } }
    }): Promise<{ count: number }>
  }
  telegramIngestionMessageMedia: {
    findMany(args: {
      where: {
        status: { in: Array<'SOURCE_GONE' | 'SKIPPED_OVERSIZE'> }
        createdAt: { lt: Date }
      }
      select: { id: true }
      take: number
    }): Promise<Array<{ id: string }>>
    deleteMany(args: {
      where: { id: { in: string[] } }
    }): Promise<{ count: number }>
  }
}

export interface SweeperDeps {
  db: SweeperDb
  policy: RetentionPolicy
  now: () => Date
  signal?: AbortSignal
  /** Emits a small heartbeat every iteration so operators can tell
   *  a stuck sweeper from a slow one. Injected for tests. */
  onHeartbeat?: (progress: SweepProgress) => void
  correlationId?: string
}

export interface SweepProgress {
  target: 'syncRun' | 'ingestionJob' | 'failedMedia'
  deletedSoFar: number
  batchDeleted: number
}

export interface SweepResult {
  correlationId: string
  startedAt: Date
  finishedAt: Date
  durationMs: number
  deletedSyncRuns: number
  deletedIngestionJobs: number
  deletedFailedMedia: number
  stoppedReason: 'completed' | 'deadline' | 'aborted'
}

export async function runRetentionSweep(
  deps: SweeperDeps,
): Promise<SweepResult> {
  const correlationId = deps.correlationId ?? generateCorrelationId()
  const startedAt = deps.now()
  const deadline = startedAt.getTime() + deps.policy.sweepMaxDurationMs

  logger.info(`${LOG_SCOPE}.started`, {
    correlationId,
    policy: {
      syncRunDays: deps.policy.syncRunRetentionDays,
      ingestionJobDays: deps.policy.ingestionJobRetentionDays,
      failedMediaDays: deps.policy.failedMediaRetentionDays,
      batchSize: deps.policy.sweepBatchSize,
    },
  })

  let deletedSyncRuns = 0
  let deletedIngestionJobs = 0
  let deletedFailedMedia = 0
  let stoppedReason: SweepResult['stoppedReason'] = 'completed'

  const budget = (): 'ok' | 'deadline' | 'aborted' => {
    if (deps.signal?.aborted) return 'aborted'
    if (deps.now().getTime() >= deadline) return 'deadline'
    return 'ok'
  }

  // 1. Sync runs ------------------------------------------------------
  const syncRunCutoff = daysAgo(deps.now(), deps.policy.syncRunRetentionDays)
  while (true) {
    const state = budget()
    if (state !== 'ok') {
      stoppedReason = state
      break
    }
    const candidates = await deps.db.telegramIngestionSyncRun.findMany({
      where: { startedAt: { lt: syncRunCutoff } },
      select: { id: true },
      take: deps.policy.sweepBatchSize,
    })
    if (candidates.length === 0) break
    const { count } = await deps.db.telegramIngestionSyncRun.deleteMany({
      where: { id: { in: candidates.map((c) => c.id) } },
    })
    deletedSyncRuns += count
    deps.onHeartbeat?.({
      target: 'syncRun',
      deletedSoFar: deletedSyncRuns,
      batchDeleted: count,
    })
    if (candidates.length < deps.policy.sweepBatchSize) break
  }

  // 2. Ingestion jobs (terminal only) ---------------------------------
  if (stoppedReason === 'completed') {
    const jobCutoff = daysAgo(deps.now(), deps.policy.ingestionJobRetentionDays)
    while (true) {
      const state = budget()
      if (state !== 'ok') {
        stoppedReason = state
        break
      }
      const candidates = await deps.db.ingestionJob.findMany({
        where: {
          status: { in: ['OK', 'FAILED', 'DEAD'] },
          finishedAt: { lt: jobCutoff },
        },
        select: { id: true },
        take: deps.policy.sweepBatchSize,
      })
      if (candidates.length === 0) break
      const { count } = await deps.db.ingestionJob.deleteMany({
        where: { id: { in: candidates.map((c) => c.id) } },
      })
      deletedIngestionJobs += count
      deps.onHeartbeat?.({
        target: 'ingestionJob',
        deletedSoFar: deletedIngestionJobs,
        batchDeleted: count,
      })
      if (candidates.length < deps.policy.sweepBatchSize) break
    }
  }

  // 3. Failed / gone media (no blob to leak) --------------------------
  if (stoppedReason === 'completed') {
    const mediaCutoff = daysAgo(deps.now(), deps.policy.failedMediaRetentionDays)
    while (true) {
      const state = budget()
      if (state !== 'ok') {
        stoppedReason = state
        break
      }
      const candidates = await deps.db.telegramIngestionMessageMedia.findMany({
        where: {
          status: { in: ['SOURCE_GONE', 'SKIPPED_OVERSIZE'] },
          createdAt: { lt: mediaCutoff },
        },
        select: { id: true },
        take: deps.policy.sweepBatchSize,
      })
      if (candidates.length === 0) break
      const { count } = await deps.db.telegramIngestionMessageMedia.deleteMany({
        where: { id: { in: candidates.map((c) => c.id) } },
      })
      deletedFailedMedia += count
      deps.onHeartbeat?.({
        target: 'failedMedia',
        deletedSoFar: deletedFailedMedia,
        batchDeleted: count,
      })
      if (candidates.length < deps.policy.sweepBatchSize) break
    }
  }

  const finishedAt = deps.now()
  const result: SweepResult = {
    correlationId,
    startedAt,
    finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    deletedSyncRuns,
    deletedIngestionJobs,
    deletedFailedMedia,
    stoppedReason,
  }
  logger.info(`${LOG_SCOPE}.finished`, { ...result })
  return result
}

function daysAgo(now: Date, days: number): Date {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() - days)
  return d
}
