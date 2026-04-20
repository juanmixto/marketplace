import type PgBoss from 'pg-boss'
import { db } from '@/lib/db'
import {
  buildDrafts,
  CURRENT_RULES_EXTRACTOR_VERSION,
  EXTRACTION_SCHEMA_VERSION,
  classifyMessage,
  confidenceBandFor,
  extractRules,
  isStageEnabled,
  normaliseConfidence,
  type DraftsBuilderDb,
  type ExtractionPayload,
} from '@/domains/ingestion'
import { logger } from '@/lib/logger'
import { generateCorrelationId } from '@/lib/correlation'

/**
 * Worker adapter for the Phase 2 processing pipeline.
 *
 * The worker job name is `ingestion.processing.process-message`. It
 * runs the full deterministic chain for a single raw message:
 *
 *   1. stage gate: umbrella kill + `feat-ingestion-rules-extractor`
 *      flag must both allow action.
 *   2. load message row.
 *   3. classifier → classifier result.
 *   4. if kind !== PRODUCT, still persist the extraction result as an
 *      audit row via `buildDrafts` (it handles the skip path).
 *   5. if PRODUCT, extractor → drafts builder (single transaction).
 *
 * Phase 2 deliberately runs the three stages inline: splitting them
 * across three pg-boss jobs would complicate idempotency without any
 * measurable benefit at current volumes. Phase 2.5 (LLM) will
 * introduce a separate job because LLM cost makes it worth isolating.
 */

function emptyExtractionFor(
  classifierKind: 'CONVERSATION' | 'SPAM' | 'OTHER',
): ExtractionPayload {
  return {
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    products: [],
    vendorHint: {
      externalId: null,
      displayName: null,
      meta: { rule: 'classifiedNonProduct', source: classifierKind },
    },
    confidenceOverall: 0,
    rulesFired: [],
  }
}

export interface ProcessMessageJobData {
  messageId: string
  correlationId?: string
}

export async function runProcessMessageJob(
  job: PgBoss.Job<ProcessMessageJobData>,
): Promise<void> {
  const correlationId = job.data.correlationId ?? generateCorrelationId()
  const stageEnabled = await isStageEnabled('rules-extractor', undefined, {
    correlationId,
    messageId: job.data.messageId,
    jobKind: 'ingestion.processing.process-message',
  })
  if (!stageEnabled) {
    return
  }

  const message = await db.telegramIngestionMessage.findUnique({
    where: { id: job.data.messageId },
  })
  if (!message) {
    logger.warn('ingestion.processing.message_not_found', {
      messageId: job.data.messageId,
      correlationId,
    })
    return
  }

  const classifierAlso = await isStageEnabled('classifier', undefined, {
    correlationId,
    messageId: message.id,
    jobKind: 'ingestion.processing.process-message',
  })
  if (!classifierAlso) {
    return
  }

  const classifier = classifyMessage({ text: message.text })
  const classifierConfidence = normaliseConfidence(classifier.confidence)
  const classifierBand = confidenceBandFor(classifierConfidence)

  const extractorVersion = CURRENT_RULES_EXTRACTOR_VERSION
  const extraction = classifier.kind === 'PRODUCT'
    ? extractRules({
        text: message.text ?? '',
        vendorHint: {
          authorExternalId: message.tgAuthorId?.toString() ?? null,
        },
      })
    : emptyExtractionFor(classifier.kind)

  await buildDrafts(
    {
      messageId: message.id,
      extractorVersion,
      classification: {
        kind: classifier.kind,
        confidence: classifierConfidence,
        confidenceBand: classifierBand,
        signals: classifier.signals,
      },
      extraction,
      inputSnapshot: {
        text: message.text,
        postedAt: message.postedAt,
        tgMessageId: message.tgMessageId.toString(),
        tgAuthorId: message.tgAuthorId?.toString() ?? null,
      },
      correlationId,
    },
    {
      db: db as unknown as DraftsBuilderDb,
    },
  )
}
