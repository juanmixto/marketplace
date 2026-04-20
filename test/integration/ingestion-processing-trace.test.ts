import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import {
  buildDrafts,
  CURRENT_RULES_EXTRACTOR_VERSION,
  classifyMessage,
  confidenceBandFor,
  extractRules,
  normaliseConfidence,
  type DraftsBuilderDb,
} from '@/domains/ingestion'
import { resetIntegrationDatabase } from './helpers'

/**
 * End-to-end trace against real Postgres: raw message →
 * classifier → extractor → drafts builder → DB rows with full
 * provenance. Re-run idempotency is asserted on real unique
 * constraints, not on in-memory fakes.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

async function seedMessage(text: string) {
  const connection = await db.telegramIngestionConnection.create({
    data: {
      label: 'Test',
      phoneNumberHash: 'h',
      sessionRef: `sess-${Date.now()}-${Math.random()}`,
      status: 'ACTIVE',
      createdByUserId: 'u1',
    },
  })
  const chat = await db.telegramIngestionChat.create({
    data: {
      connectionId: connection.id,
      tgChatId: BigInt(-100),
      title: 'Test',
      kind: 'SUPERGROUP',
      isEnabled: true,
    },
  })
  const message = await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(1),
      tgAuthorId: BigInt(42),
      text,
      rawJson: { text },
      postedAt: new Date('2026-04-20T10:00:00Z'),
    },
  })
  return message
}

async function runPipeline(messageId: string, text: string) {
  const classifier = classifyMessage({ text })
  const classifierConfidence = normaliseConfidence(classifier.confidence)
  const extraction =
    classifier.kind === 'PRODUCT'
      ? extractRules({ text, vendorHint: { authorExternalId: '42' } })
      : ({
          schemaVersion: 2 as const,
          products: [] as never[],
          vendorHint: {
            externalId: null,
            displayName: null,
            meta: { rule: 'classifiedNonProduct', source: classifier.kind },
          },
          confidenceOverall: 0,
          rulesFired: [] as string[],
        } as const)

  return buildDrafts(
    {
      messageId,
      extractorVersion: CURRENT_RULES_EXTRACTOR_VERSION,
      classification: {
        kind: classifier.kind,
        confidence: classifierConfidence,
        confidenceBand: confidenceBandFor(classifierConfidence),
        signals: classifier.signals,
      },
      extraction,
      inputSnapshot: { text },
      correlationId: 'cid-int-1',
    },
    {
      db: db as unknown as DraftsBuilderDb,
      isKilled: async () => false,
    },
  )
}

test('integration: PRODUCT message materialises extraction + vendor + product drafts + queue', async () => {
  const message = await seedMessage('Manzanas golden: 2,50€/kg. Disponibles hoy.')
  const result = await runPipeline(message.id, message.text!)
  assert.equal(result.status, 'OK')

  const extractions = await db.ingestionExtractionResult.findMany({
    where: { messageId: message.id },
  })
  assert.equal(extractions.length, 1)
  assert.equal(extractions[0]!.engine, 'RULES')
  assert.equal(extractions[0]!.classification, 'PRODUCT')

  const drafts = await db.ingestionProductDraft.findMany({
    where: { sourceMessageId: message.id },
  })
  assert.equal(drafts.length, 1)
  assert.equal(drafts[0]!.priceCents, 250)
  assert.equal(drafts[0]!.unit, 'KG')

  const queueItems = await db.ingestionReviewQueueItem.findMany({
    where: { kind: 'PRODUCT_DRAFT', targetId: drafts[0]!.id },
  })
  assert.equal(queueItems.length, 1)
})

test('integration: re-running pipeline on same message + version is idempotent', async () => {
  const message = await seedMessage('Tomates raf 3,20€/kg')
  await runPipeline(message.id, message.text!)
  await runPipeline(message.id, message.text!)
  assert.equal(
    await db.ingestionExtractionResult.count({ where: { messageId: message.id } }),
    1,
  )
  assert.equal(
    await db.ingestionProductDraft.count({ where: { sourceMessageId: message.id } }),
    1,
  )
  assert.equal(
    await db.ingestionReviewQueueItem.count(),
    1,
    'review queue must not be double-enqueued',
  )
})

test('integration: multi-product message creates one draft per productOrdinal', async () => {
  const message = await seedMessage('• Tomates 1,80€/kg\n• Lechuga 0,90€/ud')
  const result = await runPipeline(message.id, message.text!)
  assert.equal(result.status, 'OK')
  assert.equal(result.productDraftIds.length, 2)
  const drafts = await db.ingestionProductDraft.findMany({
    where: { sourceMessageId: message.id },
    orderBy: { productOrdinal: 'asc' },
  })
  assert.equal(drafts.length, 2)
  assert.equal(drafts[0]!.productOrdinal, 0)
  assert.equal(drafts[1]!.productOrdinal, 1)
  assert.equal(drafts[0]!.priceCents, 180)
  assert.equal(drafts[1]!.priceCents, 90)
  // Attributes must not leak across products.
  assert.equal(drafts[0]!.unit, 'KG')
  assert.equal(drafts[1]!.unit, 'UNIT')
})

test('integration: CONVERSATION message creates audit row but no drafts and no queue items', async () => {
  const message = await seedMessage(
    'Hola buenas, ¿alguien sabe si queda algo para el sábado?',
  )
  const result = await runPipeline(message.id, message.text!)
  assert.equal(result.status, 'SKIPPED_NON_PRODUCT')
  assert.equal(
    await db.ingestionExtractionResult.count({ where: { messageId: message.id } }),
    1,
  )
  assert.equal(
    await db.ingestionProductDraft.count({ where: { sourceMessageId: message.id } }),
    0,
  )
  assert.equal(await db.ingestionReviewQueueItem.count(), 0)
})

test('integration: bumping extractor version creates a new revision alongside the old one', async () => {
  const message = await seedMessage('Patatas 1,20€/kg')
  await runPipeline(message.id, message.text!)
  // Manually call buildDrafts with a bumped version to simulate a
  // rule upgrade without mutating the current constant.
  const classifier = classifyMessage({ text: message.text! })
  await buildDrafts(
    {
      messageId: message.id,
      extractorVersion: 'rules-1.3.0-hypothetical',
      classification: {
        kind: classifier.kind,
        confidence: 0.9,
        confidenceBand: 'HIGH',
        signals: classifier.signals,
      },
      extraction: extractRules({
        text: message.text!,
        vendorHint: { authorExternalId: '42' },
      }),
      inputSnapshot: { text: message.text },
      correlationId: 'cid-int-2',
    },
    { db: db as unknown as DraftsBuilderDb, isKilled: async () => false },
  )
  // Two extractions coexist, one per version.
  const extractions = await db.ingestionExtractionResult.findMany({
    where: { messageId: message.id },
    orderBy: { extractorVersion: 'asc' },
  })
  assert.equal(extractions.length, 2)
  assert.deepEqual(
    extractions.map((e) => e.extractorVersion),
    ['rules-1.2.0', 'rules-1.3.0-hypothetical'],
  )
  // Corresponding product drafts per version.
  const drafts = await db.ingestionProductDraft.findMany({
    where: { sourceMessageId: message.id },
  })
  assert.equal(drafts.length, 2)
})
