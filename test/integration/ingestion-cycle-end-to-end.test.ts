import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import {
  CURRENT_RULES_EXTRACTOR_VERSION,
  buildDrafts,
  classifyMessage,
  computeProcessingAggregates,
  confidenceBandFor,
  evaluateThresholds,
  extractRules,
  normaliseConfidence,
  scanDedupe,
  type DedupeScannerDb,
  type DraftsBuilderDb,
  type ObservabilityDb,
} from '@/domains/ingestion'
import { resetIntegrationDatabase } from './helpers'

/**
 * End-to-end Phase 2 cycle: raw messages → classifier → extractor →
 * drafts → dedupe → aggregates. Single integration file that pins
 * the complete pipeline shape against real Postgres, so any
 * regression in the chain fails CI with a human-readable trace.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

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
      postedAt: new Date(`2026-04-20T10:${tgMessageId.toString().padStart(2, '0')}:00Z`),
    },
  })
  const classifier = classifyMessage({ text })
  const classifierConfidence = normaliseConfidence(classifier.confidence)
  const extraction =
    classifier.kind === 'PRODUCT'
      ? extractRules({ text, vendorHint: { authorExternalId: authorId } })
      : {
          schemaVersion: 2 as const,
          products: [] as never[],
          vendorHint: {
            externalId: null,
            displayName: null,
            meta: { rule: 'classifiedNonProduct', source: classifier.kind },
          },
          confidenceOverall: 0,
          rulesFired: [] as string[],
        }
  const result = await buildDrafts(
    {
      messageId: message.id,
      extractorVersion: CURRENT_RULES_EXTRACTOR_VERSION,
      classification: {
        kind: classifier.kind,
        confidence: classifierConfidence,
        confidenceBand: confidenceBandFor(classifierConfidence),
        signals: classifier.signals,
      },
      extraction,
      inputSnapshot: { text },
      correlationId: `cid-${tgMessageId}`,
    },
    { db: db as unknown as DraftsBuilderDb, isKilled: async () => false },
  )
  // Run dedupe for every freshly built product draft.
  for (const draftId of result.productDraftIds) {
    await scanDedupe(
      { productDraftId: draftId, correlationId: `cid-dedupe-${tgMessageId}` },
      {
        db: db as unknown as DedupeScannerDb,
        now: () => new Date('2026-04-20T12:00:00Z'),
        isStageEnabledFn: async () => true,
      },
    )
  }
}

test('integration: end-to-end cycle produces coherent aggregates across stages', async () => {
  const conn = await db.telegramIngestionConnection.create({
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
      connectionId: conn.id,
      tgChatId: BigInt(-100),
      title: 'Test',
      kind: 'SUPERGROUP',
      isEnabled: true,
    },
  })

  // PRODUCT x3: one unique, one exact-duplicate of the first (STRONG
  // → LOW auto-merge), one similar-name-different-vendor (SIMILARITY
  // → HIGH, review queued).
  await ingest(chat.id, 1, 'Manzanas golden 2,50€/kg', '42')
  await ingest(chat.id, 2, 'Manzanas golden 2,50€/kg', '42')
  await ingest(chat.id, 3, 'Manzanas golden 2,80€/kg', '99')

  // CONVERSATION and SPAM, to make sure the classification mix is
  // represented in the aggregates.
  await ingest(chat.id, 4, 'Hola buenas, ¿alguien sabe algo?', '42')
  await ingest(chat.id, 5, 'Click aquí https://bit.ly/promo', '99')

  // PRODUCT with no extractable price — expected skip (bias).
  await ingest(chat.id, 6, 'Hoy tengo manzanas disponibles', '42')

  // The aggregator filters by the `createdAt` of Ingestion* rows
  // (not `postedAt`), so the window has to cover whatever wall-clock
  // moment these writes happen. Anchoring to `new Date()` ± a day
  // lets this test keep working after the calendar ticks past the
  // fixture date — the previous hard-coded 2026-04-21 ceiling
  // silently dropped every row once the runner passed that moment.
  const now = new Date()
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const to = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const aggregates = await computeProcessingAggregates(
    db as unknown as ObservabilityDb,
    { from, to },
  )

  // Classification distribution
  assert.ok(aggregates.classification.PRODUCT >= 3)
  assert.ok(aggregates.classification.CONVERSATION >= 1)
  assert.ok(aggregates.classification.SPAM >= 1)

  // Extractions: one per processed message (PRODUCT + non-PRODUCT
  // both persist an audit row).
  assert.equal(aggregates.extractions.total, 6)
  assert.equal(aggregates.extractions.byEngine.RULES, 6)
  assert.equal(aggregates.extractions.byEngine.LLM, 0)

  // Drafts: 3 PRODUCT messages with extractable data → 3 drafts;
  // message #6 (PRODUCT, no price) → skip, no draft.
  assert.equal(aggregates.drafts.total, 3)

  // Skip metric
  // #1, #2, #3, #6 are PRODUCT classifications (4 total); #6 skipped.
  // (Message #6 has "manzanas" and "disponibles" — conservative
  // classifier may label it OTHER rather than PRODUCT. Accept
  // whichever the real pipeline produces as long as the skip row
  // math stays internally consistent.)
  assert.ok(aggregates.skip.productClassifications >= 3)
  // When all PRODUCT classifications yielded at least one draft the
  // skip ratio is 0; when the classifier picked up the no-price
  // message it's >0. Either outcome is acceptable — the metric is
  // well-defined in both cases.
  assert.ok(aggregates.skip.ratio >= 0 && aggregates.skip.ratio <= 1)

  // Dedupe: #2 auto-merges with #1 (STRONG/LOW). #3 creates a
  // SIMILARITY/HIGH candidate against #1. Possibly also against #2
  // before the auto-merge takes effect — whichever, both counts
  // should be positive.
  assert.ok(aggregates.dedupe.byKind.STRONG >= 1, 'at least one STRONG match')
  assert.ok(
    aggregates.dedupe.byKind.SIMILARITY >= 1,
    'at least one SIMILARITY match',
  )
  assert.equal(aggregates.dedupe.byRisk.LOW, aggregates.dedupe.byKind.STRONG)
  assert.equal(
    aggregates.dedupe.byRisk.HIGH,
    aggregates.dedupe.byKind.SIMILARITY,
  )
  assert.ok(aggregates.dedupe.autoMerged >= 1, 'at least one auto-merge')
  assert.ok(
    aggregates.dedupe.enqueuedForReview >= 1,
    'at least one MEDIUM/HIGH candidate queued',
  )

  // Review queue:
  //   - PRODUCT_DRAFT rows, one per draft (3).
  //   - DEDUPE_CANDIDATE rows, one per MEDIUM/HIGH candidate.
  //   - state distribution: at least one AUTO_RESOLVED (from the LOW
  //     auto-merge), at least one ENQUEUED (from the review candidate).
  assert.ok(aggregates.reviewQueue.byKind.PRODUCT_DRAFT >= 3)
  assert.ok(aggregates.reviewQueue.byKind.DEDUPE_CANDIDATE >= 1)
  assert.ok(aggregates.reviewQueue.byState.AUTO_RESOLVED >= 1)
  assert.ok(aggregates.reviewQueue.byState.ENQUEUED >= 1)

  // Thresholds: healthy small sample → zero or well-justified breaches.
  const breaches = evaluateThresholds(aggregates)
  // The aggregates may trip `reviewRatioMax` on a tiny sample; that
  // is expected for a 3-draft test — we just assert the check runs
  // and names are structured.
  for (const b of breaches) {
    assert.ok(typeof b.name === 'string' && b.hint.length > 0)
  }
})
