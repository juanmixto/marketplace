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
  scanDedupe,
  type DedupeScannerDb,
  type DraftsBuilderDb,
} from '@/domains/ingestion'
import { resetIntegrationDatabase } from './helpers'

/**
 * Integration tests exercise the dedupe scanner against real Postgres
 * so the LOW-only auto-merge policy, the non-destructive canonical
 * pointer updates, and the review-queue state transitions are pinned
 * end-to-end.
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

async function ingest(
  chatId: string,
  tgMessageId: number,
  text: string,
  authorId: string,
) {
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
  const conf = normaliseConfidence(classifier.confidence)
  const extraction = extractRules({
    text,
    vendorHint: { authorExternalId: authorId },
  })
  await buildDrafts(
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
      inputSnapshot: { text },
      correlationId: `cid-${tgMessageId}`,
    },
    { db: db as unknown as DraftsBuilderDb, isKilled: async () => false },
  )
  return message.id
}

async function runDedupeFor(productDraftId: string) {
  return scanDedupe(
    { productDraftId, correlationId: 'cid-dedupe' },
    {
      db: db as unknown as DedupeScannerDb,
      now: () => new Date('2026-04-20T12:00:00Z'),
      isStageEnabledFn: async () => true,
    },
  )
}

test('integration: STRONG match → LOW risk → auto-merge + AUTO_RESOLVED queue row', async () => {
  const chat = await seedChat()
  await ingest(chat.id, 1, 'Manzanas golden 2,50€/kg', '42')
  await ingest(chat.id, 2, 'Manzanas golden 2,50€/kg', '42')

  const drafts = await db.ingestionProductDraft.findMany({
    orderBy: { createdAt: 'asc' },
  })
  assert.equal(drafts.length, 2)
  const [first, second] = drafts
  const result = await runDedupeFor(second!.id)
  assert.equal(result.autoMerged, 1)
  assert.equal(result.byKind.STRONG, 1)
  assert.equal(result.byRisk.LOW, 1)

  const secondAfter = await db.ingestionProductDraft.findUniqueOrThrow({
    where: { id: second!.id },
  })
  assert.equal(secondAfter.canonicalDraftId, first!.id)
  assert.equal(secondAfter.duplicateOf, first!.id)
  // First (canonical) row is untouched.
  const firstAfter = await db.ingestionProductDraft.findUniqueOrThrow({
    where: { id: first!.id },
  })
  assert.equal(firstAfter.canonicalDraftId, null)

  const queueRow = await db.ingestionReviewQueueItem.findFirstOrThrow({
    where: { kind: 'PRODUCT_DRAFT', targetId: second!.id },
  })
  assert.equal(queueRow.state, 'AUTO_RESOLVED')
  assert.match(queueRow.autoResolvedReason ?? '', /identicalAcrossAllFields/)

  const candidate = await db.ingestionDedupeCandidate.findFirstOrThrow({
    where: { leftDraftId: second!.id, rightDraftId: first!.id },
  })
  assert.equal(candidate.kind, 'STRONG')
  assert.equal(candidate.riskClass, 'LOW')
  assert.equal(candidate.autoApplied, true)
})

test('integration: HEURISTIC (different price) → MEDIUM → DEDUPE_CANDIDATE enqueued, no auto-merge', async () => {
  const chat = await seedChat()
  await ingest(chat.id, 1, 'Tomates raf 3,20€/kg', '42')
  await ingest(chat.id, 2, 'Tomates raf 3,50€/kg', '42')

  const drafts = await db.ingestionProductDraft.findMany({
    orderBy: { createdAt: 'asc' },
  })
  assert.equal(drafts.length, 2)
  const [, second] = drafts
  const result = await runDedupeFor(second!.id)
  assert.equal(result.byKind.HEURISTIC, 1)
  assert.equal(result.byRisk.MEDIUM, 1)
  assert.equal(result.autoMerged, 0)
  assert.equal(result.enqueuedForReview, 1)

  // Non-destructive: second draft is still canonical-less.
  const secondAfter = await db.ingestionProductDraft.findUniqueOrThrow({
    where: { id: second!.id },
  })
  assert.equal(secondAfter.canonicalDraftId, null)
  // Its product-draft queue row stays ENQUEUED.
  const productQueue = await db.ingestionReviewQueueItem.findFirstOrThrow({
    where: { kind: 'PRODUCT_DRAFT', targetId: second!.id },
  })
  assert.equal(productQueue.state, 'ENQUEUED')

  const candidate = await db.ingestionDedupeCandidate.findFirstOrThrow({
    where: { kind: 'HEURISTIC' },
  })
  assert.equal(candidate.riskClass, 'MEDIUM')
  assert.equal(candidate.autoApplied, false)
  // A DEDUPE_CANDIDATE queue row was created for human review.
  const dedupeQueue = await db.ingestionReviewQueueItem.findFirstOrThrow({
    where: { kind: 'DEDUPE_CANDIDATE', targetId: candidate.id },
  })
  assert.equal(dedupeQueue.state, 'ENQUEUED')
  assert.equal(dedupeQueue.priority, 50)
})

test('integration: SIMILARITY (different vendor, same name) → HIGH, review only', async () => {
  const chat = await seedChat()
  await ingest(chat.id, 1, 'Naranjas valencianas 1,50€/kg', '10')
  await ingest(chat.id, 2, 'Naranjas valencianas 1,80€/kg', '11')

  const drafts = await db.ingestionProductDraft.findMany({
    orderBy: { createdAt: 'asc' },
  })
  const [, second] = drafts
  const result = await runDedupeFor(second!.id)
  assert.equal(result.byKind.SIMILARITY, 1)
  assert.equal(result.byRisk.HIGH, 1)
  assert.equal(result.autoMerged, 0)

  const candidate = await db.ingestionDedupeCandidate.findFirstOrThrow({
    where: { kind: 'SIMILARITY' },
  })
  assert.equal(candidate.riskClass, 'HIGH')
  assert.equal(candidate.autoApplied, false)
  const queue = await db.ingestionReviewQueueItem.findFirstOrThrow({
    where: { kind: 'DEDUPE_CANDIDATE', targetId: candidate.id },
  })
  assert.equal(queue.priority, 100, 'HIGH risk must prioritise higher than MEDIUM')
})

test('integration: stage flag off → scanner returns KILLED with no DB writes', async () => {
  const chat = await seedChat()
  await ingest(chat.id, 1, 'Manzanas golden 2,50€/kg', '42')
  await ingest(chat.id, 2, 'Manzanas golden 2,50€/kg', '42')
  const drafts = await db.ingestionProductDraft.findMany({
    orderBy: { createdAt: 'asc' },
  })
  const before = await db.ingestionDedupeCandidate.count()
  const result = await scanDedupe(
    { productDraftId: drafts[1]!.id, correlationId: 'cid' },
    {
      db: db as unknown as DedupeScannerDb,
      now: () => new Date(),
      isStageEnabledFn: async () => false,
    },
  )
  assert.equal(result.status, 'KILLED')
  const after = await db.ingestionDedupeCandidate.count()
  assert.equal(after, before, 'no candidate rows must be written under kill')
})

test('integration: scanner is idempotent (re-run produces no duplicate candidates)', async () => {
  const chat = await seedChat()
  await ingest(chat.id, 1, 'Tomates raf 3,20€/kg', '42')
  await ingest(chat.id, 2, 'Tomates raf 3,50€/kg', '42')
  const drafts = await db.ingestionProductDraft.findMany({
    orderBy: { createdAt: 'asc' },
  })
  await runDedupeFor(drafts[1]!.id)
  const firstCount = await db.ingestionDedupeCandidate.count()
  await runDedupeFor(drafts[1]!.id)
  const secondCount = await db.ingestionDedupeCandidate.count()
  assert.equal(secondCount, firstCount, 're-run must not create duplicate candidates')
})

test('integration: STRONG match on vendor with same externalId → auto-link vendors across versions', async () => {
  // Simulate a version bump: seed two vendor rows at two extractor
  // versions with the same externalId, then run dedupe via a product
  // from the newer version.
  const chat = await seedChat()
  await ingest(chat.id, 1, 'Patatas 1,20€/kg', '42')
  // Manually add a second vendor draft at a bumped extractor version
  // with the same externalId, plus a product referring to it.
  const newerVendor = await db.ingestionVendorDraft.create({
    data: {
      externalId: '42',
      displayName: 'Granja test',
      inferredFromMessageIds: ['m2'],
      extractorVersion: 'rules-1.1.0',
      confidenceOverall: 0.9,
      confidenceBand: 'HIGH',
    },
  })
  const msg = await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(99),
      tgAuthorId: BigInt(42),
      text: 'Patatas 1,20€/kg',
      rawJson: {},
      postedAt: new Date(),
    },
  })
  const extraction = extractRules({
    text: 'Patatas 1,20€/kg',
    vendorHint: { authorExternalId: '42' },
  })
  const extractionRow = await db.ingestionExtractionResult.create({
    data: {
      messageId: msg.id,
      engine: 'RULES',
      extractorVersion: 'rules-1.1.0',
      inputSnapshot: {},
      payload: extraction,
      confidenceOverall: 0.9,
      confidenceBand: 'HIGH',
      confidenceByField: {},
      classification: 'PRODUCT',
      correlationId: 'cid',
    },
  })
  const newerProduct = await db.ingestionProductDraft.create({
    data: {
      sourceMessageId: msg.id,
      sourceExtractionId: extractionRow.id,
      extractorVersion: 'rules-1.1.0',
      productOrdinal: 0,
      vendorDraftId: newerVendor.id,
      confidenceOverall: 0.9,
      confidenceBand: 'HIGH',
      productName: 'Patatas',
      categorySlug: null,
      unit: 'KG',
      weightGrams: null,
      priceCents: 120,
      currencyCode: 'EUR',
      availability: 'UNKNOWN',
      rawFieldsSeen: {},
    },
  })

  // The newer vendor should auto-merge into the older vendor via
  // scanDedupe even though the product-side comparison doesn't
  // match across versions.
  const result = await runDedupeFor(newerProduct.id)
  assert.ok(result.byKind.STRONG >= 1)

  const refreshed = await db.ingestionVendorDraft.findUniqueOrThrow({
    where: { id: newerVendor.id },
  })
  assert.ok(
    refreshed.canonicalDraftId,
    'newer vendor must point at the older canonical via externalId match',
  )
})
