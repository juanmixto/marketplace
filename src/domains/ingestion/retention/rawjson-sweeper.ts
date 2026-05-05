import { Prisma } from '@/generated/prisma/client'
import { logger } from '@/lib/logger'
import { generateCorrelationId } from '@/lib/correlation'
import type { RetentionPolicy } from './config'

/**
 * Raw-payload sweeper for Telegram ingestion messages.
 *
 * Safety invariants:
 *
 *   1. **In-place only.** The `TelegramIngestionMessage` row stays
 *      alive; only `rawJson` is nulled out.
 *   2. **Batch-based.** We walk in bounded batches so dry-run and
 *      live runs behave the same way.
 *   3. **Idempotent.** Once `rawJson` is null, the row falls out of
 *      scope and later sweeps skip it.
 *   4. **Policy split.** Tombstoned rows are purged immediately.
 *      Non-processed rows use the longer retention window.
 *      Processed rows use the shorter retention window.
 */

const LOG_SCOPE = 'ingestion.retention.rawjson_sweep'

export interface RawJsonSweepDb {
  telegramIngestionMessage: {
    findMany(args: {
      where: Record<string, unknown>
      select: { id: true }
      orderBy: { id: 'asc' }
      take: number
      cursor?: { id: string }
      skip?: number
    }): Promise<Array<{ id: string }>>
    updateMany(args: {
      where: { id: { in: string[] } }
      data: { rawJson: typeof Prisma.DbNull }
    }): Promise<{ count: number }>
  }
}

export interface RawJsonSweepDeps {
  db: RawJsonSweepDb
  policy: RetentionPolicy
  now: () => Date
  dryRun?: boolean
  signal?: AbortSignal
  onHeartbeat?: (progress: RawJsonSweepProgress) => void
  correlationId?: string
}

export interface RawJsonSweepProgress {
  target: 'tombstoned' | 'processed' | 'unprocessed'
  purgedSoFar: number
  batchPurged: number
}

export interface RawJsonSweepResult {
  correlationId: string
  startedAt: Date
  finishedAt: Date
  durationMs: number
  dryRun: boolean
  purgedTombstoned: number
  purgedProcessed: number
  purgedUnprocessed: number
  stoppedReason: 'completed' | 'deadline' | 'aborted'
}

function resolveDryRun(explicit: boolean | undefined): boolean {
  if (typeof explicit === 'boolean') return explicit
  const raw = process.env.INGESTION_TELEGRAM_RAWJSON_SWEEP_DRY_RUN
  if (typeof raw !== 'string') return true
  return raw.trim().toLowerCase() !== 'false'
}

function daysAgo(now: Date, days: number): Date {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() - days)
  return d
}

function hasProcessedRelations(): Record<string, unknown> {
  return {
    OR: [
      { ingestionExtractionResults: { some: {} } },
      { ingestionProductDrafts: { some: {} } },
    ],
  }
}

function hasNoProcessedRelations(): Record<string, unknown> {
  return {
    ingestionExtractionResults: { none: {} },
    ingestionProductDrafts: { none: {} },
  }
}

async function purgeBatch(
  deps: RawJsonSweepDeps,
  where: Record<string, unknown>,
  cursor: string | undefined,
  dryRun: boolean,
): Promise<{ ids: string[]; count: number }> {
  const rows = await deps.db.telegramIngestionMessage.findMany({
    where: {
      rawJson: { not: Prisma.DbNull },
      ...where,
    },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: deps.policy.rawJsonSweepBatchSize,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  if (rows.length === 0) return { ids: [], count: 0 }

  if (dryRun) {
    return { ids: rows.map((row) => row.id), count: rows.length }
  }

  const ids = rows.map((row) => row.id)
  const { count } = await deps.db.telegramIngestionMessage.updateMany({
    where: { id: { in: ids } },
    data: { rawJson: Prisma.DbNull },
  })
  return { ids, count }
}

async function runPass(
  deps: RawJsonSweepDeps,
  target: RawJsonSweepProgress['target'],
  where: Record<string, unknown>,
  deadline: number,
  deletedSoFar: number,
  dryRun: boolean,
): Promise<{ deleted: number; stoppedReason: RawJsonSweepResult['stoppedReason']; cursor?: string }> {
  let deleted = 0
  let stoppedReason: RawJsonSweepResult['stoppedReason'] = 'completed'
  let cursor: string | undefined

  while (true) {
    if (deps.signal?.aborted) {
      stoppedReason = 'aborted'
      break
    }
    if (deps.now().getTime() >= deadline) {
      stoppedReason = 'deadline'
      break
    }

    const batch = await purgeBatch(deps, where, cursor, dryRun)
    if (batch.ids.length === 0) break

    deleted += batch.count
    cursor = batch.ids[batch.ids.length - 1]
    deps.onHeartbeat?.({
      target,
      purgedSoFar: deletedSoFar + deleted,
      batchPurged: batch.count,
    })

    if (batch.ids.length < deps.policy.rawJsonSweepBatchSize) break
  }

  return { deleted, stoppedReason, cursor }
}

export async function runTelegramRawJsonSweep(
  deps: RawJsonSweepDeps,
): Promise<RawJsonSweepResult> {
  const dryRun = resolveDryRun(deps.dryRun)
  const correlationId = deps.correlationId ?? generateCorrelationId()
  const startedAt = deps.now()
  const deadline = startedAt.getTime() + deps.policy.rawJsonSweepMaxDurationMs

  logger.info(`${LOG_SCOPE}.started`, {
    correlationId,
    dryRun,
    policy: {
      processedDays: deps.policy.rawJsonProcessedRetentionDays,
      unprocessedDays: deps.policy.rawJsonUnprocessedRetentionDays,
      batchSize: deps.policy.rawJsonSweepBatchSize,
    },
  })

  const tombstonedWhere = { tombstoned: true }
  const processedWhere = {
    tombstoned: false,
    postedAt: { lt: daysAgo(deps.now(), deps.policy.rawJsonProcessedRetentionDays) },
    ...hasProcessedRelations(),
  }
  const unprocessedWhere = {
    tombstoned: false,
    postedAt: { lt: daysAgo(deps.now(), deps.policy.rawJsonUnprocessedRetentionDays) },
    ...hasNoProcessedRelations(),
  }

  const tombstoned = await runPass(deps, 'tombstoned', tombstonedWhere, deadline, 0, dryRun)
  let purgedTombstoned = tombstoned.deleted
  let purgedProcessed = 0
  let purgedUnprocessed = 0
  let stoppedReason = tombstoned.stoppedReason

  if (stoppedReason === 'completed') {
    const processed = await runPass(
      deps,
      'processed',
      processedWhere,
      deadline,
      purgedTombstoned,
      dryRun,
    )
    purgedProcessed = processed.deleted
    stoppedReason = processed.stoppedReason
  }

  if (stoppedReason === 'completed') {
    const unprocessed = await runPass(
      deps,
      'unprocessed',
      unprocessedWhere,
      deadline,
      purgedTombstoned + purgedProcessed,
      dryRun,
    )
    purgedUnprocessed = unprocessed.deleted
    stoppedReason = unprocessed.stoppedReason
  }

  const finishedAt = deps.now()
  const result: RawJsonSweepResult = {
    correlationId,
    startedAt,
    finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    dryRun,
    purgedTombstoned,
    purgedProcessed,
    purgedUnprocessed,
    stoppedReason,
  }
  logger.info(`${LOG_SCOPE}.finished`, { ...result })
  return result
}
