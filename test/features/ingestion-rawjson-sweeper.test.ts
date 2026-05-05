import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveRetentionPolicy,
  runTelegramRawJsonSweep,
  type RawJsonSweepDb,
  type RawJsonSweepDeps,
} from '@/domains/ingestion'

/**
 * Unit tests for the Telegram rawJson retention sweep. The fake DB
 * keeps the matching rules honest without needing a Postgres round
 * trip for every branch.
 */

interface MessageRow {
  id: string
  rawJson: unknown | null
  tombstoned: boolean
  postedAt: Date
  processed: boolean
}

function createFakeDb(seed: MessageRow[]): RawJsonSweepDb & { _state: { messages: MessageRow[] } } {
  const state = { messages: [...seed] }
  const db = {
    telegramIngestionMessage: {
      async findMany({ where, take, cursor }: { where: Record<string, any>; take: number; cursor?: { id: string }; skip?: number }) {
        const rows = state.messages
          .filter((row) => row.rawJson !== null)
          .filter((row) => (typeof where.tombstoned === 'boolean' ? row.tombstoned === where.tombstoned : true))
          .filter((row) => (where.postedAt?.lt ? row.postedAt < where.postedAt.lt : true))
          .filter((row) => (where.OR ? row.processed : true))
          .filter((row) =>
            where.ingestionExtractionResults?.none || where.ingestionProductDrafts?.none
              ? !row.processed
              : true,
          )
          .sort((a, b) => a.id.localeCompare(b.id))

        const start = cursor ? rows.findIndex((row) => row.id === cursor.id) + 1 : 0
        return rows.slice(start, start + take).map((row) => ({ id: row.id }))
      },
      async updateMany({ where }: { where: { id: { in: string[] } } }) {
        const ids = new Set(where.id.in)
        let count = 0
        state.messages = state.messages.map((row) => {
          if (!ids.has(row.id)) return row
          count += 1
          return { ...row, rawJson: null }
        })
        return { count }
      },
    },
    _state: state,
  } as unknown as RawJsonSweepDb & { _state: { messages: MessageRow[] } }
  return db
}

function baseDeps(db: RawJsonSweepDb, overrides: Partial<RawJsonSweepDeps> = {}): RawJsonSweepDeps {
  return {
    db,
    policy: resolveRetentionPolicy({}),
    now: () => new Date('2026-05-05T12:00:00Z'),
    ...overrides,
  }
}

function daysBefore(now: Date, days: number): Date {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() - days)
  return d
}

test('rawJson sweep defaults to dry-run and leaves rows untouched', async () => {
  const now = new Date('2026-05-05T12:00:00Z')
  const db = createFakeDb([
    { id: 'tombstoned', rawJson: { a: 1 }, tombstoned: true, postedAt: daysBefore(now, 1), processed: false },
    { id: 'processed-old', rawJson: { a: 2 }, tombstoned: false, postedAt: daysBefore(now, 40), processed: true },
    { id: 'unprocessed-old', rawJson: { a: 3 }, tombstoned: false, postedAt: daysBefore(now, 100), processed: false },
    { id: 'fresh', rawJson: { a: 4 }, tombstoned: false, postedAt: daysBefore(now, 5), processed: false },
  ])

  const result = await runTelegramRawJsonSweep(baseDeps(db, { now: () => now }))
  assert.equal(result.dryRun, true)
  assert.equal(result.purgedTombstoned, 1)
  assert.equal(result.purgedProcessed, 1)
  assert.equal(result.purgedUnprocessed, 1)
  assert.deepEqual(
    db._state.messages.map((row) => ({ id: row.id, rawJson: row.rawJson })),
    [
      { id: 'tombstoned', rawJson: { a: 1 } },
      { id: 'processed-old', rawJson: { a: 2 } },
      { id: 'unprocessed-old', rawJson: { a: 3 } },
      { id: 'fresh', rawJson: { a: 4 } },
    ],
  )
})

test('rawJson sweep nulls matched rows when dry-run is disabled and stays idempotent', async () => {
  const now = new Date('2026-05-05T12:00:00Z')
  const db = createFakeDb([
    { id: 'fresh', rawJson: { a: 4 }, tombstoned: false, postedAt: daysBefore(now, 5), processed: false },
    { id: 'processed-old', rawJson: { a: 2 }, tombstoned: false, postedAt: daysBefore(now, 40), processed: true },
    { id: 'tombstoned', rawJson: { a: 1 }, tombstoned: true, postedAt: daysBefore(now, 1), processed: false },
    { id: 'unprocessed-old', rawJson: { a: 3 }, tombstoned: false, postedAt: daysBefore(now, 100), processed: false },
  ])

  const result = await runTelegramRawJsonSweep(baseDeps(db, { now: () => now, dryRun: false }))
  assert.equal(result.dryRun, false)
  assert.equal(result.purgedTombstoned, 1)
  assert.equal(result.purgedProcessed, 1)
  assert.equal(result.purgedUnprocessed, 1)
  assert.deepEqual(
    db._state.messages.map((row) => ({ id: row.id, rawJson: row.rawJson })),
    [
      { id: 'fresh', rawJson: { a: 4 } },
      { id: 'processed-old', rawJson: null },
      { id: 'tombstoned', rawJson: null },
      { id: 'unprocessed-old', rawJson: null },
    ],
  )

  const second = await runTelegramRawJsonSweep(baseDeps(db, { now: () => now, dryRun: false }))
  assert.equal(second.purgedTombstoned, 0)
  assert.equal(second.purgedProcessed, 0)
  assert.equal(second.purgedUnprocessed, 0)
})
