import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import {
  CURRENT_RULES_EXTRACTOR_VERSION,
  buildDrafts,
  classifyMessage,
  confidenceBandFor,
  extractRules,
  normaliseConfidence,
  scanUnextractableDedupe,
  type DraftsBuilderDb,
  type UnextractableScannerDb,
} from '@/domains/ingestion'
import { resetIntegrationDatabase } from './helpers'

/**
 * Integration test for the rules-1.2.0 unextractable dedupe scanner
 * against real Postgres. Exercises the new
 * IngestionUnextractableDedupeCandidate table + review queue state
 * transitions end-to-end.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

async function seedChat() {
  const conn = await db.telegramIngestionConnection.create({
    data: {
      label: 'Test',
      phoneNumberHash: 'h',
      sessionRef: `sess-${Date.now()}-${Math.random()}`,
      status: 'ACTIVE',
      createdByUserId: 'u1',
    },
  })
  return db.telegramIngestionChat.create({
    data: {
      connectionId: conn.id,
      tgChatId: BigInt(-100),
      title: 't',
      kind: 'SUPERGROUP',
      isEnabled: true,
    },
  })
}

async function ingestProductNoPrice(chatId: string, tgMessageId: number, text: string, authorId: string) {
  const message = await db.telegramIngestionMessage.create({
    data: {
      chatId,
      tgMessageId: BigInt(tgMessageId),
      tgAuthorId: BigInt(authorId),
      text,
      rawJson: { text },
      postedAt: new Date('2026-04-20T10:00:00Z'),
    },
  })
  const classifier = classifyMessage({ text })
  // Only PRODUCT_NO_PRICE is in scope for this scanner
  assert.equal(classifier.kind, 'PRODUCT_NO_PRICE', `expected PRODUCT_NO_PRICE, got ${classifier.kind}`)
  const conf = normaliseConfidence(classifier.confidence)
  const extraction = extractRules({ text, vendorHint: { authorExternalId: authorId } })
  const result = await buildDrafts(
    {
      messageId: message.id,
      extractorVersion: CURRENT_RULES_EXTRACTOR_VERSION,
      classification: {
        kind: classifier.kind,
        confidence: conf,
        confidenceBand: confidenceBandFor(conf),
        signals: classifier.signals,
      },
      extraction,
      inputSnapshot: { text, tgMessageId: message.tgMessageId.toString(), tgAuthorId: message.tgAuthorId?.toString() ?? null },
      correlationId: `cid-${tgMessageId}`,
    },
    { db: db as unknown as DraftsBuilderDb, isKilled: async () => false },
  )
  return { message, extractionId: result.extractionResultId! }
}

test('integration: PRODUCT_NO_PRICE same author + same first line → STRONG LOW auto-merge', async () => {
  const chat = await seedChat()
  // Both messages have the same first line and same author.
  const a = await ingestProductNoPrice(chat.id, 1, 'Miel artesanal de nuestra granja\nPara encargos por privado', '42')
  const b = await ingestProductNoPrice(chat.id, 2, 'Miel artesanal de nuestra granja\nSeguimos con la temporada', '42')

  const result = await scanUnextractableDedupe(
    { extractionId: b.extractionId, correlationId: 'cid-dedupe' },
    { db: db as unknown as UnextractableScannerDb, now: () => new Date('2026-04-20T12:00:00Z'), isStageEnabledFn: async () => true },
  )
  assert.equal(result.status, 'OK')
  assert.equal(result.autoMerged, 1)

  const candidates = await db.ingestionUnextractableDedupeCandidate.findMany()
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0]!.kind, 'STRONG')
  assert.equal(candidates[0]!.riskClass, 'LOW')
  assert.equal(candidates[0]!.autoApplied, true)
  assert.ok(candidates[0]!.autoAppliedAt)

  const review = await db.ingestionReviewQueueItem.findFirstOrThrow({
    where: { kind: 'UNEXTRACTABLE_PRODUCT', targetId: b.extractionId },
  })
  assert.equal(review.state, 'AUTO_RESOLVED')
  assert.match(review.autoResolvedReason ?? '', /sameAuthorSameNormalisedFirstLine/)

  // The older extraction's queue row stays ENQUEUED (it's the canonical).
  const olderReview = await db.ingestionReviewQueueItem.findFirstOrThrow({
    where: { kind: 'UNEXTRACTABLE_PRODUCT', targetId: a.extractionId },
  })
  assert.equal(olderReview.state, 'ENQUEUED')
})

test('integration: PRODUCT_NO_PRICE different authors + same first line → HEURISTIC MEDIUM, no auto-merge', async () => {
  const chat = await seedChat()
  await ingestProductNoPrice(chat.id, 1, 'Naranjas Valencies de nuestra huerta\nnos organizamos semanalmente', '10')
  const b = await ingestProductNoPrice(chat.id, 2, 'Naranjas Valencies de nuestra huerta\nforward desde otro grupo', '99')

  const result = await scanUnextractableDedupe(
    { extractionId: b.extractionId, correlationId: 'cid-dedupe' },
    { db: db as unknown as UnextractableScannerDb, now: () => new Date(), isStageEnabledFn: async () => true },
  )
  assert.equal(result.status, 'OK')
  assert.equal(result.autoMerged, 0)
  assert.equal(result.enqueuedForReview, 1)

  const candidates = await db.ingestionUnextractableDedupeCandidate.findMany()
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0]!.kind, 'HEURISTIC')
  assert.equal(candidates[0]!.riskClass, 'MEDIUM')
  assert.equal(candidates[0]!.autoApplied, false)

  // Both queue rows stay ENQUEUED (the candidate is a side pointer, not a state change).
  const reviewB = await db.ingestionReviewQueueItem.findFirstOrThrow({
    where: { kind: 'UNEXTRACTABLE_PRODUCT', targetId: b.extractionId },
  })
  assert.equal(reviewB.state, 'ENQUEUED')
})

test('integration: re-run scanner does not duplicate candidates (idempotent upsert)', async () => {
  const chat = await seedChat()
  await ingestProductNoPrice(chat.id, 1, 'Miel artesanal de nuestra colmena\nedición limitada', '42')
  const b = await ingestProductNoPrice(chat.id, 2, 'Miel artesanal de nuestra colmena\npedidos por privado', '42')

  const opts = {
    db: db as unknown as UnextractableScannerDb,
    now: () => new Date('2026-04-20T12:00:00Z'),
    isStageEnabledFn: async () => true,
  }
  await scanUnextractableDedupe({ extractionId: b.extractionId, correlationId: 'cid-1' }, opts)
  const firstCount = await db.ingestionUnextractableDedupeCandidate.count()
  await scanUnextractableDedupe({ extractionId: b.extractionId, correlationId: 'cid-2' }, opts)
  const secondCount = await db.ingestionUnextractableDedupeCandidate.count()
  assert.equal(firstCount, secondCount, 'no duplicate rows on re-run')
})

test('integration: cascade delete message → extraction → unextractable candidates', async () => {
  const chat = await seedChat()
  const a = await ingestProductNoPrice(chat.id, 1, 'Tomate de nuestro huerto\nrecogido esta mañana', '42')
  const b = await ingestProductNoPrice(chat.id, 2, 'Tomate de nuestro huerto\ndisponibles también pack familiar', '42')
  await scanUnextractableDedupe(
    { extractionId: b.extractionId, correlationId: 'c' },
    {
      db: db as unknown as UnextractableScannerDb,
      now: () => new Date(),
      isStageEnabledFn: async () => true,
    },
  )
  assert.equal(await db.ingestionUnextractableDedupeCandidate.count(), 1)
  // Delete the older message → cascade removes its extraction → cascades
  // remove any candidate referencing it on either side.
  await db.telegramIngestionMessage.delete({ where: { id: a.message.id } })
  assert.equal(await db.ingestionUnextractableDedupeCandidate.count(), 0)
})
