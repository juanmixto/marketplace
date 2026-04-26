/**
 * Replay the sanitised dry-run dataset through the real pipeline into
 * the dev DB so `/admin/ingestion` has something to look at.
 *
 * Writes a synthetic TelegramIngestionConnection/Chat + one
 * TelegramIngestionMessage per JSONL row, then runs classifier →
 * extractor → drafts builder → product-dedupe → unextractable-dedupe
 * against the same `db` instance the web app uses. Output is live
 * Ingestion* rows that the admin review queue UI can render.
 *
 * Safe to re-run: if a message with the same (chatId, tgMessageId)
 * already exists, it is reused (see @@unique on that model).
 */

import { readFileSync } from 'node:fs'
import { db } from '@/lib/db'
import {
  CURRENT_RULES_EXTRACTOR_VERSION,
  EXTRACTION_SCHEMA_VERSION,
  buildDrafts,
  classifyMessage,
  confidenceBandFor,
  extractRules,
  normaliseConfidence,
  scanDedupe,
  scanUnextractableDedupe,
  type DedupeScannerDb,
  type DraftsBuilderDb,
  type ExtractionPayload,
  type UnextractableScannerDb,
} from '@/domains/ingestion'

interface DatasetRow {
  groupLabel: string
  tgMessageId: number
  tgAuthorId: number | null
  postedAt: string
  text: string
  authorDisplayName?: string
}

const DATASET = process.argv.find((a) => a.startsWith('--dataset='))?.split('=')[1]
  ?? '/tmp/dry-run/dataset.jsonl'

function emptyPayload(
  kind: 'PRODUCT_NO_PRICE' | 'CONVERSATION' | 'SPAM' | 'OTHER',
): ExtractionPayload {
  return {
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    products: [],
    vendorHint: {
      externalId: null,
      displayName: null,
      meta: {
        rule: kind === 'PRODUCT_NO_PRICE' ? 'classifiedProductNoPrice' : 'classifiedNonProduct',
        source: kind,
      },
    },
    confidenceOverall: 0,
    rulesFired: [],
  }
}

async function ensureInfra(groupLabel: string) {
  // Deterministic synthetic connection + chat per group label so reruns
  // are idempotent against the unique constraints.
  const sessionRef = `dry-run-${groupLabel}`
  const connection = await db.telegramIngestionConnection.upsert({
    where: { sessionRef },
    create: {
      label: `Dry-run ${groupLabel}`,
      phoneNumberHash: `dry-run-${groupLabel}`,
      sessionRef,
      status: 'ACTIVE',
      createdByUserId: 'dry-run',
    },
    update: {},
  })
  const tgChatId = BigInt(-100_000_000) - BigInt(groupLabel.charCodeAt(1) ?? 1)
  const chat = await db.telegramIngestionChat.upsert({
    where: { connectionId_tgChatId: { connectionId: connection.id, tgChatId } },
    create: {
      connectionId: connection.id,
      tgChatId,
      title: `Dry-run ${groupLabel}`,
      kind: 'SUPERGROUP',
      isEnabled: true,
    },
    update: {},
  })
  return { connection, chat }
}

async function main() {
  const raw = readFileSync(DATASET, 'utf-8').trim().split('\n')
  const rows: DatasetRow[] = raw.map((l) => JSON.parse(l))
  console.log(`[replay] dataset=${DATASET} rows=${rows.length} extractor=${CURRENT_RULES_EXTRACTOR_VERSION}`)

  let messagesCreated = 0
  let messagesReused = 0
  let built = 0
  let unextractable = 0
  let skippedNonProduct = 0

  for (const row of rows) {
    const { chat } = await ensureInfra(row.groupLabel)
    const tgMessageId = BigInt(row.tgMessageId)
    const existing = await db.telegramIngestionMessage.findUnique({
      where: { chatId_tgMessageId: { chatId: chat.id, tgMessageId } },
    })
    const message = existing
      ?? (await db.telegramIngestionMessage.create({
        data: {
          chatId: chat.id,
          tgMessageId,
          tgAuthorId: row.tgAuthorId == null ? null : BigInt(row.tgAuthorId),
          text: row.text,
          rawJson: { text: row.text, authorDisplayName: row.authorDisplayName ?? null },
          postedAt: new Date(row.postedAt),
        },
      }))
    if (existing) messagesReused++
    else messagesCreated++

    const classifier = classifyMessage({ text: message.text })
    const conf = normaliseConfidence(classifier.confidence)
    const extraction = classifier.kind === 'PRODUCT'
      ? extractRules({
          text: message.text ?? '',
          vendorHint: { authorExternalId: message.tgAuthorId?.toString() ?? null },
        })
      : emptyPayload(classifier.kind)

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
        inputSnapshot: {
          text: message.text,
          postedAt: message.postedAt,
          tgMessageId: message.tgMessageId.toString(),
          tgAuthorId: message.tgAuthorId?.toString() ?? null,
        },
        correlationId: `replay-${message.id}`,
      },
      { db: db as unknown as DraftsBuilderDb, isKilled: async () => false },
    )
    if (result.status === 'OK') {
      built += result.productDraftIds.length
      for (const draftId of result.productDraftIds) {
        await scanDedupe(
          { productDraftId: draftId, correlationId: `dedupe-${draftId}` },
          {
            db: db as unknown as DedupeScannerDb,
            now: () => new Date(),
            isStageEnabledFn: async () => true,
          },
        )
      }
    } else if (result.status === 'UNEXTRACTABLE') {
      unextractable++
      if (result.extractionResultId) {
        await scanUnextractableDedupe(
          { extractionId: result.extractionResultId, correlationId: `unx-${result.extractionResultId}` },
          {
            db: db as unknown as UnextractableScannerDb,
            now: () => new Date(),
            isStageEnabledFn: async () => true,
          },
        )
      }
    } else if (result.status === 'SKIPPED_NON_PRODUCT') {
      skippedNonProduct++
    }
  }

  const summary = {
    dataset: DATASET,
    extractorVersion: CURRENT_RULES_EXTRACTOR_VERSION,
    messagesInput: rows.length,
    messagesCreated,
    messagesReused,
    productDraftsBuiltThisRun: built,
    unextractableThisRun: unextractable,
    skippedNonProductThisRun: skippedNonProduct,
    dbCounts: {
      messages: await db.telegramIngestionMessage.count(),
      extractions: await db.ingestionExtractionResult.count(),
      productDrafts: await db.ingestionProductDraft.count(),
      vendorDrafts: await db.ingestionVendorDraft.count(),
      dedupeCandidates: await db.ingestionDedupeCandidate.count(),
      unextractableDedupeCandidates: await db.ingestionUnextractableDedupeCandidate.count(),
      reviewQueueTotal: await db.ingestionReviewQueueItem.count(),
      reviewQueueEnqueued: await db.ingestionReviewQueueItem.count({ where: { state: 'ENQUEUED' } }),
      reviewQueueAutoResolved: await db.ingestionReviewQueueItem.count({ where: { state: 'AUTO_RESOLVED' } }),
    },
  }
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
