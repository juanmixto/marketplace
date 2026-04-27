import type PgBoss from 'pg-boss'
import { db } from '@/lib/db'
import { enqueue } from '@/lib/queue'
import {
  buildDrafts,
  CURRENT_RULES_EXTRACTOR_VERSION,
  DEFAULT_LLM_MODEL,
  EXTRACTION_SCHEMA_VERSION,
  LlmExtractorError,
  PROCESSING_JOB_KINDS,
  classifyMessage,
  confidenceBandFor,
  extractRules,
  extractWithLlm,
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
  classifierKind: 'PRODUCT_NO_PRICE' | 'CONVERSATION' | 'SPAM' | 'OTHER',
): ExtractionPayload {
  return {
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    products: [],
    vendorHint: {
      externalId: null,
      displayName: null,
      meta: {
        rule:
          classifierKind === 'PRODUCT_NO_PRICE'
            ? 'classifiedProductNoPrice'
            : 'classifiedNonProduct',
        source: classifierKind,
      },
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

  // Phase 2.5: optionally run the local LLM first. If `feat-ingestion-llm-extractor`
  // is enabled and the LLM call succeeds, we use its verdict for both
  // classification and extraction in a single round-trip. On any LLM
  // failure (transport, timeout, schema) we fall back to the rules
  // pipeline below — never block ingestion on the LLM.
  const llmEnabled = await isStageEnabled('llm-extractor', undefined, {
    correlationId,
    messageId: message.id,
    jobKind: 'ingestion.processing.process-message',
  })

  let classifierKind: 'PRODUCT' | 'PRODUCT_NO_PRICE' | 'CONVERSATION' | 'SPAM' | 'OTHER'
  let classifierConfidence: number
  let classifierSignals: Array<{ rule: string; weight: number; match: string }>
  let extraction: ExtractionPayload
  let extractorVersion: string

  let llmFailed = false
  if (llmEnabled && (message.text ?? '').trim().length > 0) {
    try {
      const llmOut = await extractWithLlm(
        {
          text: message.text ?? '',
          vendorHint: {
            authorExternalId: message.tgAuthorId?.toString() ?? null,
          },
          correlationId,
        },
        {
          model: process.env.INGESTION_LLM_MODEL?.trim() || DEFAULT_LLM_MODEL,
          timeoutMs: parseTimeoutMs(process.env.INGESTION_LLM_TIMEOUT_MS),
        },
      )
      classifierKind = llmOut.classification.kind
      classifierConfidence = normaliseConfidence(llmOut.classification.confidence)
      classifierSignals = llmOut.classification.signals
      extraction = llmOut.payload
      extractorVersion = llmOut.extractorVersion
      logger.info('ingestion.processing.llm.ok', {
        messageId: message.id,
        kind: classifierKind,
        latencyMs: llmOut.latencyMs,
        tokensIn: llmOut.costTokensIn,
        tokensOut: llmOut.costTokensOut,
        // NOTE: IngestionExtractionResult.engine remains 'RULES' for now —
        // the builder is shared with the rules path and changing the
        // engine column means a contract migration. The
        // `extractorVersion` field (e.g. "llm-qwen2.5-3b-v1") fully
        // identifies this run; downstream queries should branch on
        // extractorVersion startsWith "llm-" rather than on engine.
        correlationId,
      })
    } catch (err) {
      llmFailed = true
      logger.warn('ingestion.processing.llm.fallback_to_rules', {
        messageId: message.id,
        cause: err instanceof LlmExtractorError ? err.cause : 'unknown',
        latencyMs: err instanceof LlmExtractorError ? err.latencyMs : 0,
        error: err instanceof Error ? err.message : String(err),
        correlationId,
      })
    }
  }

  if (!llmEnabled || llmFailed) {
    const classifier = classifyMessage({ text: message.text })
    classifierKind = classifier.kind
    classifierConfidence = normaliseConfidence(classifier.confidence)
    classifierSignals = classifier.signals
    extractorVersion = CURRENT_RULES_EXTRACTOR_VERSION
    extraction = classifier.kind === 'PRODUCT'
      ? extractRules({
          text: message.text ?? '',
          vendorHint: {
            authorExternalId: message.tgAuthorId?.toString() ?? null,
          },
        })
      : emptyExtractionFor(classifier.kind)
  }

  const classifierBand = confidenceBandFor(classifierConfidence!)

  const draftsResult = await buildDrafts(
    {
      messageId: message.id,
      extractorVersion: extractorVersion!,
      classification: {
        kind: classifierKind!,
        confidence: classifierConfidence!,
        confidenceBand: classifierBand,
        signals: classifierSignals!,
      },
      extraction: extraction!,
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

  // Enqueue one dedupe scan per freshly built product draft. Dedupe
  // is stage-flagged (`feat-ingestion-dedupe`) independently, so the
  // jobs sit dormant in the queue until operators opt in. Enqueue is
  // best-effort: a queue failure leaves the draft in the review
  // queue as PENDING, never loses it.
  if (draftsResult.status === 'OK') {
    for (const draftId of draftsResult.productDraftIds) {
      try {
        await enqueue(
          PROCESSING_JOB_KINDS.dedupeDrafts,
          { productDraftId: draftId, correlationId },
          { singletonKey: `dedupe:${draftId}` },
        )
      } catch (err) {
        logger.warn('ingestion.processing.dedupe.enqueue_failed', {
          productDraftId: draftId,
          correlationId,
          error: err,
        })
      }
    }
  }

  // rules-1.2.0: enqueue an unextractable-dedupe scan when the
  // builder routed to UNEXTRACTABLE. Same stage gate, same
  // best-effort semantics.
  if (
    draftsResult.status === 'UNEXTRACTABLE' &&
    draftsResult.extractionResultId
  ) {
    try {
      await enqueue(
        PROCESSING_JOB_KINDS.unextractableDedupe,
        { extractionId: draftsResult.extractionResultId, correlationId },
        { singletonKey: `unxdedupe:${draftsResult.extractionResultId}` },
      )
    } catch (err) {
      logger.warn('ingestion.processing.unextractable-dedupe.enqueue_failed', {
        extractionId: draftsResult.extractionResultId,
        correlationId,
        error: err,
      })
    }
  }
}

function parseTimeoutMs(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return undefined
  // Hard ceiling: even on a slow CPU box, 5 min per message is too
  // long — the worker would block the queue and fail SLAs.
  return Math.min(n, 300_000)
}
