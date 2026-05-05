import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import {
  resolveRetentionPolicy,
  runTelegramRawJsonSweep,
  type RawJsonSweepDb,
} from '@/domains/ingestion'
import { resetIntegrationDatabase } from './helpers'

/**
 * End-to-end exercise for the Telegram rawJson retention sweep.
 * Confirms the job nulls payloads in place while leaving the message
 * rows and their relation graph intact.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

const NOW = new Date('2026-05-05T12:00:00Z')

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

test('integration: rawJson sweep nulls tombstoned, processed, and stale unprocessed rows', async () => {
  const chat = await seedChat()

  const tombstoned = await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(1),
      tgAuthorId: null,
      text: 'tombstoned',
      postedAt: daysBefore(1),
      tombstoned: true,
      rawJson: { text: 'tombstoned' },
    },
  })

  const processedOld = await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(2),
      tgAuthorId: null,
      text: 'processed-old',
      postedAt: daysBefore(40),
      rawJson: { text: 'processed-old' },
    },
  })
  await db.ingestionExtractionResult.create({
    data: {
      messageId: processedOld.id,
      engine: 'RULES',
      extractorVersion: 'rules-1.1.0',
      inputSnapshot: {},
      payload: { kind: 'PRODUCT' },
      confidenceOverall: 0.9,
      confidenceBand: 'HIGH',
      confidenceByField: {},
      classification: 'PRODUCT',
      correlationId: 'cid-processed-old',
    },
  })

  const staleUnprocessed = await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(3),
      tgAuthorId: null,
      text: 'stale-unprocessed',
      postedAt: daysBefore(100),
      rawJson: { text: 'stale-unprocessed' },
    },
  })

  const freshProcessed = await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(4),
      tgAuthorId: null,
      text: 'fresh-processed',
      postedAt: daysBefore(5),
      rawJson: { text: 'fresh-processed' },
    },
  })
  await db.ingestionExtractionResult.create({
    data: {
      messageId: freshProcessed.id,
      engine: 'RULES',
      extractorVersion: 'rules-1.1.0',
      inputSnapshot: {},
      payload: { kind: 'PRODUCT' },
      confidenceOverall: 0.9,
      confidenceBand: 'HIGH',
      confidenceByField: {},
      classification: 'PRODUCT',
      correlationId: 'cid-fresh-processed',
    },
  })

  const result = await runTelegramRawJsonSweep({
    db: db as unknown as RawJsonSweepDb,
    policy: resolveRetentionPolicy({}),
    now: () => NOW,
    dryRun: false,
  })
  assert.equal(result.dryRun, false)
  assert.equal(result.purgedTombstoned, 1)
  assert.equal(result.purgedProcessed, 1)
  assert.equal(result.purgedUnprocessed, 1)

  const rows = await db.telegramIngestionMessage.findMany({
    where: { id: { in: [tombstoned.id, processedOld.id, staleUnprocessed.id, freshProcessed.id] } },
    select: { id: true, rawJson: true },
    orderBy: { id: 'asc' },
  })
  const byId = new Map(rows.map((row) => [row.id, row.rawJson]))
  assert.equal(byId.get(tombstoned.id), null)
  assert.equal(byId.get(processedOld.id), null)
  assert.equal(byId.get(staleUnprocessed.id), null)
  assert.deepEqual(byId.get(freshProcessed.id), { text: 'fresh-processed' })
})
