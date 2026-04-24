import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { resetIntegrationDatabase } from './helpers'

/**
 * Pins the Phase 2 processing schema against real Postgres. Catches
 * any migration that loosens a unique constraint, drops a cascade,
 * or renames a column the handlers rely on.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

test('processing: all Phase-2 tables exist and are reachable', async () => {
  const tables = await db.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'
       AND tablename IN (
         'IngestionExtractionResult',
         'IngestionProductDraft',
         'IngestionVendorDraft',
         'IngestionReviewQueueItem',
         'IngestionDedupeCandidate'
       )
     ORDER BY tablename`,
  )
  assert.deepEqual(
    tables.map((t) => t.tablename),
    [
      'IngestionDedupeCandidate',
      'IngestionExtractionResult',
      'IngestionProductDraft',
      'IngestionReviewQueueItem',
      'IngestionVendorDraft',
    ],
  )
})

test('processing: unique (messageId, extractorVersion) on extractions rejects duplicate re-run', async () => {
  const conn = await db.telegramIngestionConnection.create({
    data: {
      label: 'c',
      phoneNumberHash: 'h',
      sessionRef: `sess-${Date.now()}-${Math.random()}`,
      status: 'ACTIVE',
      createdByUserId: 'u1',
    },
  })
  const chat = await db.telegramIngestionChat.create({
    data: {
      connectionId: conn.id,
      tgChatId: BigInt(-100),
      title: 't',
      kind: 'SUPERGROUP',
      isEnabled: true,
    },
  })
  const msg = await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(1),
      tgAuthorId: null,
      text: 'test',
      rawJson: {},
      postedAt: new Date(),
    },
  })

  await db.ingestionExtractionResult.create({
    data: {
      messageId: msg.id,
      engine: 'RULES',
      extractorVersion: 'rules-1.0.0',
      inputSnapshot: { text: 'test' },
      payload: {},
      confidenceOverall: 0.75,
      confidenceBand: 'MEDIUM',
      confidenceByField: {},
      correlationId: 'cid-1',
    },
  })

  // Second row at the same (message, version) must be rejected.
  await assert.rejects(
    db.ingestionExtractionResult.create({
      data: {
        messageId: msg.id,
        engine: 'RULES',
        extractorVersion: 'rules-1.0.0',
        inputSnapshot: { text: 'test' },
        payload: {},
        confidenceOverall: 0.5,
        confidenceBand: 'MEDIUM',
        confidenceByField: {},
        correlationId: 'cid-2',
      },
    }),
    /Unique constraint/i,
  )

  // Bumping extractorVersion must succeed (new revision).
  const second = await db.ingestionExtractionResult.create({
    data: {
      messageId: msg.id,
      engine: 'RULES',
      extractorVersion: 'rules-1.0.1',
      inputSnapshot: { text: 'test' },
      payload: {},
      confidenceOverall: 0.5,
      confidenceBand: 'MEDIUM',
      confidenceByField: {},
      correlationId: 'cid-3',
    },
  })
  assert.equal(second.extractorVersion, 'rules-1.0.1')
})

test('processing: (sourceMessageId, extractorVersion, productOrdinal) uniqueness on product drafts', async () => {
  const conn = await db.telegramIngestionConnection.create({
    data: {
      label: 'c',
      phoneNumberHash: 'h',
      sessionRef: `sess-${Date.now()}-${Math.random()}`,
      status: 'ACTIVE',
      createdByUserId: 'u1',
    },
  })
  const chat = await db.telegramIngestionChat.create({
    data: {
      connectionId: conn.id,
      tgChatId: BigInt(-100),
      title: 't',
      kind: 'SUPERGROUP',
      isEnabled: true,
    },
  })
  const msg = await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(1),
      tgAuthorId: null,
      text: 'test',
      rawJson: {},
      postedAt: new Date(),
    },
  })
  const extraction = await db.ingestionExtractionResult.create({
    data: {
      messageId: msg.id,
      engine: 'RULES',
      extractorVersion: 'rules-1.0.0',
      inputSnapshot: {},
      payload: {},
      confidenceOverall: 0.9,
      confidenceBand: 'HIGH',
      confidenceByField: {},
      correlationId: 'cid-1',
    },
  })
  await db.ingestionProductDraft.create({
    data: {
      sourceMessageId: msg.id,
      sourceExtractionId: extraction.id,
      extractorVersion: 'rules-1.0.0',
      productOrdinal: 0,
      confidenceOverall: 0.9,
      confidenceBand: 'HIGH',
      rawFieldsSeen: {},
    },
  })
  // Same ordinal at the same version → reject.
  await assert.rejects(
    db.ingestionProductDraft.create({
      data: {
        sourceMessageId: msg.id,
        sourceExtractionId: extraction.id,
        extractorVersion: 'rules-1.0.0',
        productOrdinal: 0,
        confidenceOverall: 0.5,
        confidenceBand: 'MEDIUM',
        rawFieldsSeen: {},
      },
    }),
    /Unique constraint/i,
  )
  // Different ordinal at the same version → fine (multi-product message).
  const second = await db.ingestionProductDraft.create({
    data: {
      sourceMessageId: msg.id,
      sourceExtractionId: extraction.id,
      extractorVersion: 'rules-1.0.0',
      productOrdinal: 1,
      confidenceOverall: 0.6,
      confidenceBand: 'MEDIUM',
      rawFieldsSeen: {},
    },
  })
  assert.equal(second.productOrdinal, 1)
})

test('processing: canonical pointer is nullable and self-referential (non-destructive dedupe)', async () => {
  const a = await db.ingestionVendorDraft.create({
    data: {
      externalId: 'vendor-A',
      displayName: 'Granja A',
      inferredFromMessageIds: [],
      extractorVersion: 'rules-1.0.0',
      confidenceOverall: 0.9,
      confidenceBand: 'HIGH',
    },
  })
  const b = await db.ingestionVendorDraft.create({
    data: {
      externalId: 'vendor-A-dup',
      displayName: 'Granja A (dup)',
      inferredFromMessageIds: [],
      extractorVersion: 'rules-1.0.0',
      confidenceOverall: 0.9,
      confidenceBand: 'HIGH',
      canonicalDraftId: a.id,
      duplicateOf: a.id,
    },
  })
  assert.equal(b.canonicalDraftId, a.id)
  assert.equal(b.duplicateOf, a.id)
  // Canonical row A stays intact.
  const canonical = await db.ingestionVendorDraft.findUniqueOrThrow({ where: { id: a.id } })
  assert.equal(canonical.canonicalDraftId, null)
})

test('processing: cascade delete message → removes extraction + product drafts', async () => {
  const conn = await db.telegramIngestionConnection.create({
    data: {
      label: 'c',
      phoneNumberHash: 'h',
      sessionRef: `sess-${Date.now()}-${Math.random()}`,
      status: 'ACTIVE',
      createdByUserId: 'u1',
    },
  })
  const chat = await db.telegramIngestionChat.create({
    data: {
      connectionId: conn.id,
      tgChatId: BigInt(-100),
      title: 't',
      kind: 'SUPERGROUP',
      isEnabled: true,
    },
  })
  const msg = await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(1),
      tgAuthorId: null,
      text: 'test',
      rawJson: {},
      postedAt: new Date(),
    },
  })
  const extraction = await db.ingestionExtractionResult.create({
    data: {
      messageId: msg.id,
      engine: 'RULES',
      extractorVersion: 'rules-1.0.0',
      inputSnapshot: {},
      payload: {},
      confidenceOverall: 0.9,
      confidenceBand: 'HIGH',
      confidenceByField: {},
      correlationId: 'cid-1',
    },
  })
  await db.ingestionProductDraft.create({
    data: {
      sourceMessageId: msg.id,
      sourceExtractionId: extraction.id,
      extractorVersion: 'rules-1.0.0',
      productOrdinal: 0,
      confidenceOverall: 0.9,
      confidenceBand: 'HIGH',
      rawFieldsSeen: {},
    },
  })
  await db.telegramIngestionMessage.delete({ where: { id: msg.id } })
  assert.equal(await db.ingestionExtractionResult.count(), 0)
  assert.equal(await db.ingestionProductDraft.count(), 0)
})
