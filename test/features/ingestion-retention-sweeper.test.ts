import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SYNC_RUN_RETENTION_DAYS,
  resolveRetentionPolicy,
  runRetentionSweep,
  type SweeperDb,
  type SweeperDeps,
} from '@/domains/ingestion'

/**
 * Unit tests for the retention sweeper. A minimal in-memory fake DB
 * stands in for Prisma; invariants around batching, caps, and
 * cancelability are the same ones integration tests exercise against
 * Postgres in `test/integration/ingestion-sweeper.test.ts`.
 */

// ─── Fake DB ─────────────────────────────────────────────────────────────────

interface SyncRunRow {
  id: string
  startedAt: Date
}
interface JobRow {
  id: string
  status: 'QUEUED' | 'RUNNING' | 'OK' | 'FAILED' | 'DEAD'
  finishedAt: Date | null
}
interface MediaRow {
  id: string
  status: 'PENDING' | 'DOWNLOADED' | 'SKIPPED_OVERSIZE' | 'SOURCE_GONE' | 'FAILED'
  createdAt: Date
}

function createFakeSweeperDb(seed: {
  syncRuns?: SyncRunRow[]
  jobs?: JobRow[]
  media?: MediaRow[]
}): SweeperDb & { _state: { syncRuns: SyncRunRow[]; jobs: JobRow[]; media: MediaRow[] } } {
  const state = {
    syncRuns: [...(seed.syncRuns ?? [])],
    jobs: [...(seed.jobs ?? [])],
    media: [...(seed.media ?? [])],
  }
  const db = {
    telegramIngestionSyncRun: {
      async findMany({ where, take }: { where: { [k: string]: any }; take: number }) {
        return state.syncRuns
          .filter((r) => r.startedAt < where.startedAt.lt)
          .slice(0, take)
          .map((r) => ({ id: r.id }))
      },
      async deleteMany({ where }: { where: { id: { in: string[] } } }) {
        const ids = new Set(where.id.in)
        const before = state.syncRuns.length
        state.syncRuns = state.syncRuns.filter((r) => !ids.has(r.id))
        return { count: before - state.syncRuns.length }
      },
    },
    ingestionJob: {
      async findMany({ where, take }: { where: { [k: string]: any }; take: number }) {
        const statusIn = new Set<string>(where.status.in)
        return state.jobs
          .filter(
            (j) =>
              statusIn.has(j.status) &&
              j.finishedAt !== null &&
              j.finishedAt < where.finishedAt.lt,
          )
          .slice(0, take)
          .map((j) => ({ id: j.id }))
      },
      async deleteMany({ where }: { where: { id: { in: string[] } } }) {
        const ids = new Set(where.id.in)
        const before = state.jobs.length
        state.jobs = state.jobs.filter((j) => !ids.has(j.id))
        return { count: before - state.jobs.length }
      },
    },
    telegramIngestionMessageMedia: {
      async findMany({ where, take }: { where: { [k: string]: any }; take: number }) {
        const statusIn = new Set<string>(where.status.in)
        return state.media
          .filter((m) => statusIn.has(m.status) && m.createdAt < where.createdAt.lt)
          .slice(0, take)
          .map((m) => ({ id: m.id }))
      },
      async deleteMany({ where }: { where: { id: { in: string[] } } }) {
        const ids = new Set(where.id.in)
        const before = state.media.length
        state.media = state.media.filter((m) => !ids.has(m.id))
        return { count: before - state.media.length }
      },
    },
    _state: state,
  } as unknown as SweeperDb & { _state: typeof state }
  return db
}

function baseDeps(db: SweeperDb, overrides: Partial<SweeperDeps> = {}): SweeperDeps {
  return {
    db,
    policy: resolveRetentionPolicy({}),
    now: () => new Date('2026-04-20T12:00:00Z'),
    ...overrides,
  }
}

function daysBefore(now: Date, days: number): Date {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() - days)
  return d
}

// ─── Config ──────────────────────────────────────────────────────────────────

test('resolveRetentionPolicy uses conservative defaults', () => {
  const p = resolveRetentionPolicy({})
  assert.equal(p.syncRunRetentionDays, DEFAULT_SYNC_RUN_RETENTION_DAYS)
  assert.equal(p.ingestionJobRetentionDays, 30)
  assert.equal(p.failedMediaRetentionDays, 90)
  assert.equal(p.rawJsonProcessedRetentionDays, 30)
  assert.equal(p.rawJsonUnprocessedRetentionDays, 90)
  assert.equal(p.rawJsonSweepBatchSize, 500)
  assert.equal(p.rawJsonSweepMaxDurationMs, 5 * 60 * 1000)
  assert.equal(p.sweepBatchSize, 500)
  assert.equal(p.sweepMaxDurationMs, 5 * 60 * 1000)
})

test('resolveRetentionPolicy accepts env overrides but clamps extreme values', () => {
  const p = resolveRetentionPolicy({
    INGESTION_SYNC_RUN_RETENTION_DAYS: '30',
    INGESTION_SWEEP_BATCH_SIZE: '99999', // clamped to 5000
  })
  assert.equal(p.syncRunRetentionDays, 30)
  assert.equal(p.sweepBatchSize, 5000)
})

test('resolveRetentionPolicy falls back to default on invalid values', () => {
  const p = resolveRetentionPolicy({
    INGESTION_SYNC_RUN_RETENTION_DAYS: '-1',
    INGESTION_JOB_RETENTION_DAYS: 'nope',
  })
  assert.equal(p.syncRunRetentionDays, DEFAULT_SYNC_RUN_RETENTION_DAYS)
  assert.equal(p.ingestionJobRetentionDays, 30)
})

// ─── Sync-run sweep ──────────────────────────────────────────────────────────

test('sweeper deletes sync runs older than the retention window', async () => {
  const now = new Date('2026-04-20T12:00:00Z')
  const db = createFakeSweeperDb({
    syncRuns: [
      { id: 'old1', startedAt: daysBefore(now, 200) },
      { id: 'old2', startedAt: daysBefore(now, 100) },
      { id: 'fresh', startedAt: daysBefore(now, 10) },
    ],
  })
  const result = await runRetentionSweep(baseDeps(db, { now: () => now }))
  assert.equal(result.deletedSyncRuns, 2)
  assert.deepEqual(
    db._state.syncRuns.map((r) => r.id),
    ['fresh'],
  )
  assert.equal(result.stoppedReason, 'completed')
})

test('sweeper is a no-op on an empty table', async () => {
  const db = createFakeSweeperDb({})
  const result = await runRetentionSweep(baseDeps(db))
  assert.equal(result.deletedSyncRuns, 0)
  assert.equal(result.deletedIngestionJobs, 0)
  assert.equal(result.deletedFailedMedia, 0)
})

test('sweeper is idempotent: running twice changes nothing the second time', async () => {
  const now = new Date('2026-04-20T12:00:00Z')
  const db = createFakeSweeperDb({
    syncRuns: [{ id: 'r1', startedAt: daysBefore(now, 200) }],
  })
  const first = await runRetentionSweep(baseDeps(db, { now: () => now }))
  const second = await runRetentionSweep(baseDeps(db, { now: () => now }))
  assert.equal(first.deletedSyncRuns, 1)
  assert.equal(second.deletedSyncRuns, 0)
})

test('sweeper processes in bounded batches (batch size cap honoured)', async () => {
  const now = new Date('2026-04-20T12:00:00Z')
  const syncRuns = Array.from({ length: 30 }, (_, i) => ({
    id: `r${i}`,
    startedAt: daysBefore(now, 120),
  }))
  const db = createFakeSweeperDb({ syncRuns })
  const batches: number[] = []
  await runRetentionSweep(
    baseDeps(db, {
      now: () => now,
      policy: { ...resolveRetentionPolicy({}), sweepBatchSize: 10 },
      onHeartbeat: (p) => {
        if (p.target === 'syncRun') batches.push(p.batchDeleted)
      },
    }),
  )
  assert.equal(db._state.syncRuns.length, 0)
  assert.deepEqual(batches, [10, 10, 10])
})

// ─── Job sweep ───────────────────────────────────────────────────────────────

test('sweeper NEVER deletes QUEUED or RUNNING jobs, even when old', async () => {
  const now = new Date('2026-04-20T12:00:00Z')
  const db = createFakeSweeperDb({
    jobs: [
      { id: 'q', status: 'QUEUED', finishedAt: null },
      { id: 'r', status: 'RUNNING', finishedAt: null },
      { id: 'ok-old', status: 'OK', finishedAt: daysBefore(now, 90) },
      { id: 'failed-fresh', status: 'FAILED', finishedAt: daysBefore(now, 10) },
    ],
  })
  const result = await runRetentionSweep(baseDeps(db, { now: () => now }))
  assert.equal(result.deletedIngestionJobs, 1)
  assert.deepEqual(
    db._state.jobs.map((j) => j.id).sort(),
    ['failed-fresh', 'q', 'r'],
  )
})

// ─── Media sweep ─────────────────────────────────────────────────────────────

test('sweeper NEVER deletes DOWNLOADED media (source of truth)', async () => {
  const now = new Date('2026-04-20T12:00:00Z')
  const db = createFakeSweeperDb({
    media: [
      { id: 'd-old', status: 'DOWNLOADED', createdAt: daysBefore(now, 500) },
      { id: 'pending', status: 'PENDING', createdAt: daysBefore(now, 500) },
      { id: 'gone', status: 'SOURCE_GONE', createdAt: daysBefore(now, 200) },
      { id: 'oversize', status: 'SKIPPED_OVERSIZE', createdAt: daysBefore(now, 200) },
      { id: 'failed', status: 'FAILED', createdAt: daysBefore(now, 200) },
    ],
  })
  const result = await runRetentionSweep(baseDeps(db, { now: () => now }))
  assert.equal(result.deletedFailedMedia, 2)
  assert.deepEqual(
    db._state.media.map((m) => m.id).sort(),
    ['d-old', 'failed', 'pending'],
  )
})

// ─── Cancellation + deadline ─────────────────────────────────────────────────

test('sweeper stops between batches on AbortSignal', async () => {
  const now = new Date('2026-04-20T12:00:00Z')
  const syncRuns = Array.from({ length: 200 }, (_, i) => ({
    id: `r${i}`,
    startedAt: daysBefore(now, 120),
  }))
  const db = createFakeSweeperDb({ syncRuns })
  const controller = new AbortController()
  const result = await runRetentionSweep(
    baseDeps(db, {
      now: () => now,
      signal: controller.signal,
      policy: { ...resolveRetentionPolicy({}), sweepBatchSize: 50 },
      onHeartbeat: () => {
        // Abort after the first batch is deleted.
        if (!controller.signal.aborted) controller.abort()
      },
    }),
  )
  assert.equal(result.stoppedReason, 'aborted')
  // At least one batch got through; strictly less than total.
  assert.ok(result.deletedSyncRuns >= 50)
  assert.ok(result.deletedSyncRuns < 200)
})

test('sweeper stops when wall-clock cap is hit', async () => {
  // Simulate time progressing fast by mutating the `now` return
  // each call so the deadline is exceeded after the first batch.
  const start = new Date('2026-04-20T12:00:00Z')
  let calls = 0
  const tickingNow = () => {
    calls++
    // 1st call: startedAt. Every later call advances 10 minutes.
    return new Date(start.getTime() + (calls > 1 ? 10 * 60 * 1000 : 0))
  }
  const syncRuns = Array.from({ length: 50 }, (_, i) => ({
    id: `r${i}`,
    startedAt: daysBefore(start, 200),
  }))
  const db = createFakeSweeperDb({ syncRuns })
  const result = await runRetentionSweep(
    baseDeps(db, {
      now: tickingNow,
      // 1-minute cap — the second `budget()` call sees us past it.
      policy: { ...resolveRetentionPolicy({}), sweepMaxDurationMs: 60_000, sweepBatchSize: 10 },
    }),
  )
  assert.equal(result.stoppedReason, 'deadline')
})
