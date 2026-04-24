import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import {
  resolveRetentionPolicy,
  runRetentionSweep,
  type SweeperDb,
} from '@/domains/ingestion'
import { resetIntegrationDatabase } from './helpers'

/**
 * End-to-end sweeper exercise against real Postgres. Unit tests
 * (`test/features/ingestion-retention-sweeper.test.ts`) cover
 * branching logic with a fake DB; here we prove that the same logic
 * is correct when Prisma's real `findMany` + `deleteMany` run, and
 * that we never touch source-of-truth rows.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

const NOW = new Date('2026-04-20T12:00:00Z')
function daysBefore(days: number): Date {
  const d = new Date(NOW)
  d.setUTCDate(d.getUTCDate() - days)
  return d
}

async function seedChat() {
  const connection = await db.telegramIngestionConnection.create({
    data: {
      label: 'c',
      phoneNumberHash: 'h',
      sessionRef: `sess-${Date.now()}-${Math.random()}`,
      status: 'ACTIVE',
      createdByUserId: 'u1',
    },
  })
  return db.telegramIngestionChat.create({
    data: {
      connectionId: connection.id,
      tgChatId: BigInt(-100),
      title: 't',
      kind: 'SUPERGROUP',
      isEnabled: true,
    },
  })
}

test('integration: sweeper deletes old sync runs but preserves recent ones', async () => {
  const chat = await seedChat()
  await db.telegramIngestionSyncRun.createMany({
    data: [
      { chatId: chat.id, correlationId: 'old-1', startedAt: daysBefore(200) },
      { chatId: chat.id, correlationId: 'old-2', startedAt: daysBefore(100) },
      { chatId: chat.id, correlationId: 'fresh-1', startedAt: daysBefore(10) },
    ],
  })
  const result = await runRetentionSweep({
    db: db as unknown as SweeperDb,
    policy: resolveRetentionPolicy({}),
    now: () => NOW,
  })
  assert.equal(result.deletedSyncRuns, 2)
  const remaining = await db.telegramIngestionSyncRun.findMany()
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0]!.correlationId, 'fresh-1')
})

test('integration: sweeper NEVER deletes TelegramIngestionMessage rows', async () => {
  const chat = await seedChat()
  await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(1),
      tgAuthorId: null,
      text: 'forever',
      // Deliberately ancient — sweeper must still leave it alone.
      postedAt: daysBefore(9999),
      rawJson: {},
    },
  })
  await runRetentionSweep({
    db: db as unknown as SweeperDb,
    policy: resolveRetentionPolicy({}),
    now: () => NOW,
  })
  const count = await db.telegramIngestionMessage.count()
  assert.equal(count, 1, 'source-of-truth message must survive any sweep')
})

test('integration: sweeper never deletes DOWNLOADED media, only SOURCE_GONE / SKIPPED_OVERSIZE past window', async () => {
  const chat = await seedChat()
  const msg = await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(1),
      tgAuthorId: null,
      text: null,
      postedAt: NOW,
      rawJson: {},
    },
  })
  // One SOURCE_GONE row from 200 days ago (should be deleted).
  await db.$executeRawUnsafe(
    `INSERT INTO "TelegramIngestionMessageMedia"
       ("id","messageId","fileUniqueId","kind","status","blobKey","sizeBytes","mimeType","createdAt")
       VALUES ($1,$2,$3,'PHOTO','SOURCE_GONE',NULL,NULL,NULL,$4)`,
    'gone-1',
    msg.id,
    'file-gone-1',
    daysBefore(200),
  )
  // One DOWNLOADED row from 999 days ago (must survive).
  await db.$executeRawUnsafe(
    `INSERT INTO "TelegramIngestionMessageMedia"
       ("id","messageId","fileUniqueId","kind","status","blobKey","sizeBytes","mimeType","createdAt")
       VALUES ($1,$2,$3,'PHOTO','DOWNLOADED',$4,$5,'image/jpeg',$6)`,
    'dl-1',
    msg.id,
    'file-dl-1',
    'storage/abc',
    100,
    daysBefore(999),
  )
  // One FAILED row 200 days old — kept for operator diagnostics.
  await db.$executeRawUnsafe(
    `INSERT INTO "TelegramIngestionMessageMedia"
       ("id","messageId","fileUniqueId","kind","status","blobKey","sizeBytes","mimeType","createdAt","lastErrorMsg")
       VALUES ($1,$2,$3,'PHOTO','FAILED',NULL,NULL,NULL,$4,'boom')`,
    'fail-1',
    msg.id,
    'file-fail-1',
    daysBefore(200),
  )

  const result = await runRetentionSweep({
    db: db as unknown as SweeperDb,
    policy: resolveRetentionPolicy({}),
    now: () => NOW,
  })
  assert.equal(result.deletedFailedMedia, 1)

  const remaining = await db.telegramIngestionMessageMedia.findMany({
    orderBy: { id: 'asc' },
  })
  const ids = remaining.map((r) => r.id).sort()
  assert.deepEqual(ids, ['dl-1', 'fail-1'])
})

test('integration: sweeper honours batch size — large backlog still completes', async () => {
  const chat = await seedChat()
  // Seed 15 old runs with a batch size of 5 to force 3 iterations.
  const rows = Array.from({ length: 15 }, (_, i) => ({
    chatId: chat.id,
    correlationId: `r${i}`,
    startedAt: daysBefore(120),
  }))
  await db.telegramIngestionSyncRun.createMany({ data: rows })
  const heartbeats: number[] = []
  const result = await runRetentionSweep({
    db: db as unknown as SweeperDb,
    policy: { ...resolveRetentionPolicy({}), sweepBatchSize: 5 },
    now: () => NOW,
    onHeartbeat: (p) => {
      if (p.target === 'syncRun') heartbeats.push(p.batchDeleted)
    },
  })
  assert.equal(result.deletedSyncRuns, 15)
  assert.deepEqual(heartbeats, [5, 5, 5])
  assert.equal(await db.telegramIngestionSyncRun.count(), 0)
})
