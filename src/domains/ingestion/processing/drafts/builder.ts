import { logger } from '@/lib/logger'
import { confidenceBandFor, normaliseConfidence } from '../confidence'
import { isProcessingKilled } from '../flags'
import type {
  BuildDraftsInput,
  BuildDraftsResult,
  DraftsBuilderDb,
} from './types'

/**
 * Drafts builder — turns a classifier result + extractor payload
 * into `IngestionExtractionResult` + `IngestionVendorDraft` +
 * `IngestionProductDraft` + `IngestionReviewQueueItem` rows, all
 * in one transaction.
 *
 * Locked invariants honoured here:
 *
 *   - Idempotent: re-running with the same `extractorVersion` is a
 *     no-op (enforced at the DB via @@unique constraints + upsert).
 *   - Provenance: every product draft carries `sourceMessageId` +
 *     `sourceExtractionId` + `extractorVersion` + `productOrdinal`.
 *   - Vendor inference is conservative: `externalId=null` drafts are
 *     NEVER auto-merged; every vendor attempt records the rule that
 *     produced it (via the caller's `ExtractionVendorHint.meta`).
 *   - Review queue gets exactly one `PRODUCT_DRAFT` item per draft
 *     row; never duplicated on re-run.
 *   - Non-PRODUCT classifications skip draft creation but still
 *     persist the classifier's reasoning as an `ExtractionResult`
 *     row so operators can audit what rules decided.
 */

const LOG_SCOPE = 'ingestion.processing.drafts'

export interface DraftsBuilderDeps {
  db: DraftsBuilderDb
  isKilled?: (ctx: { correlationId: string; messageId: string }) => Promise<boolean>
}

export async function buildDrafts(
  input: BuildDraftsInput,
  deps: DraftsBuilderDeps,
): Promise<BuildDraftsResult> {
  const killed = await (deps.isKilled ?? defaultKillProbe)({
    correlationId: input.correlationId,
    messageId: input.messageId,
  })
  if (killed) {
    return {
      status: 'KILLED',
      extractionResultId: null,
      productDraftIds: [],
      vendorDraftId: null,
      reviewItemsEnqueued: 0,
      correlationId: input.correlationId,
    }
  }

  const result = await deps.db.$transaction(async (tx) => {
    const extractionRow = await tx.ingestionExtractionResult.upsert({
      where: {
        messageId_extractorVersion: {
          messageId: input.messageId,
          extractorVersion: input.extractorVersion,
        },
      },
      create: {
        messageId: input.messageId,
        engine: 'RULES',
        extractorVersion: input.extractorVersion,
        schemaVersion: input.extraction.schemaVersion,
        inputSnapshot: input.inputSnapshot,
        payload: input.extraction,
        confidenceOverall: normaliseConfidence(input.extraction.confidenceOverall).toFixed(2),
        confidenceBand: confidenceBandFor(
          normaliseConfidence(input.extraction.confidenceOverall),
        ),
        confidenceByField: aggregateConfidenceByField(input.extraction),
        classification: input.classification.kind,
        correlationId: input.correlationId,
      },
      update: {}, // idempotent: same (message, version) returns existing row
    })

    const kind = input.classification.kind
    const isProductLike = kind === 'PRODUCT' || kind === 'PRODUCT_NO_PRICE'

    if (!isProductLike) {
      // Non-product classifications keep an audit trail but do not
      // produce drafts or review queue items.
      return {
        status: 'SKIPPED_NON_PRODUCT' as const,
        extractionResultId: extractionRow.id,
        productDraftIds: [] as string[],
        vendorDraftId: null,
        reviewItemsEnqueued: 0,
      }
    }

    // UNEXTRACTABLE path (new in rules-1.1.0): classifier said
    // PRODUCT_NO_PRICE, OR it said PRODUCT but the extractor could
    // not produce any `products`. Either way we persist the audit
    // row and enqueue a review queue item keyed on the extraction
    // id so the Phase 3 UI can surface these for operator triage.
    if (kind === 'PRODUCT_NO_PRICE' || input.extraction.products.length === 0) {
      logger.warn(`${LOG_SCOPE}.unextractable_product`, {
        messageId: input.messageId,
        classifiedAs: kind,
        productsInPayload: input.extraction.products.length,
        correlationId: input.correlationId,
      })
      await tx.ingestionReviewQueueItem.upsert({
        where: {
          kind_targetId: {
            kind: 'UNEXTRACTABLE_PRODUCT',
            targetId: extractionRow.id,
          },
        },
        create: {
          kind: 'UNEXTRACTABLE_PRODUCT',
          targetId: extractionRow.id,
          // Mid-priority: operators should be aware but these don't
          // block live listings. Lower than HIGH-risk dedupe (100),
          // higher than plain PRODUCT_DRAFT (0).
          priority: 25,
        },
        update: {},
      })
      return {
        status: 'UNEXTRACTABLE' as const,
        extractionResultId: extractionRow.id,
        productDraftIds: [] as string[],
        vendorDraftId: null,
        reviewItemsEnqueued: 1,
      }
    }

    const vendorDraftId = await upsertVendorDraft(tx, input)

    const productDraftIds: string[] = []
    let reviewItemsEnqueued = 0
    for (const product of input.extraction.products) {
      const normalisedProductConfidence = normaliseConfidence(product.confidenceOverall)
      const draft = await tx.ingestionProductDraft.upsert({
        where: {
          sourceMessageId_extractorVersion_productOrdinal: {
            sourceMessageId: input.messageId,
            extractorVersion: input.extractorVersion,
            productOrdinal: product.productOrdinal,
          },
        },
        create: {
          sourceMessageId: input.messageId,
          sourceExtractionId: extractionRow.id,
          extractorVersion: input.extractorVersion,
          productOrdinal: product.productOrdinal,
          vendorDraftId,
          confidenceOverall: normalisedProductConfidence.toFixed(2),
          confidenceBand: confidenceBandFor(normalisedProductConfidence),
          productName: product.productName,
          categorySlug: product.categorySlug,
          unit: product.unit,
          weightGrams: product.weightGrams,
          priceCents: product.priceCents,
          currencyCode: product.currencyCode,
          availability: product.availability,
          rawFieldsSeen: product.extractionMeta,
        },
        update: {},
      })
      productDraftIds.push(draft.id)

      await tx.ingestionReviewQueueItem.upsert({
        where: { kind_targetId: { kind: 'PRODUCT_DRAFT', targetId: draft.id } },
        create: {
          kind: 'PRODUCT_DRAFT',
          targetId: draft.id,
          priority: 0,
        },
        update: {},
      })
      reviewItemsEnqueued++
    }

    return {
      status: 'OK' as const,
      extractionResultId: extractionRow.id,
      productDraftIds,
      vendorDraftId,
      reviewItemsEnqueued,
    }
  })

  logger.info(`${LOG_SCOPE}.persisted`, {
    messageId: input.messageId,
    status: result.status,
    productDraftCount: result.productDraftIds.length,
    vendorDraftId: result.vendorDraftId,
    correlationId: input.correlationId,
  })

  return { ...result, correlationId: input.correlationId }
}

async function upsertVendorDraft(
  tx: DraftsBuilderDb,
  input: BuildDraftsInput,
): Promise<string | null> {
  const hint = input.extraction.vendorHint
  const displayName = hint.displayName ?? 'Unknown vendor'
  // Use a single aggregate confidence for the vendor draft; the
  // extractor already mixed vendor-signal confidence into the payload.
  const vendorConfidence = normaliseConfidence(input.extraction.confidenceOverall)
  const band = confidenceBandFor(vendorConfidence)

  if (hint.externalId) {
    const row = await tx.ingestionVendorDraft.upsert({
      where: {
        externalId_extractorVersion: {
          externalId: hint.externalId,
          extractorVersion: input.extractorVersion,
        },
      },
      create: {
        externalId: hint.externalId,
        displayName,
        inferredFromMessageIds: [input.messageId],
        extractorVersion: input.extractorVersion,
        confidenceOverall: vendorConfidence.toFixed(2),
        confidenceBand: band,
      },
      update: {},
    })
    return row.id
  }

  // No stable external id → we must still record the vendor somewhere,
  // but we deliberately create a fresh VendorDraft per message so no
  // auto-merge logic can conflate unknown authors. Admin review will
  // later decide whether two unknown-author drafts are the same vendor.
  const row = await tx.ingestionVendorDraft.create({
    data: {
      externalId: null,
      displayName,
      inferredFromMessageIds: [input.messageId],
      extractorVersion: input.extractorVersion,
      confidenceOverall: vendorConfidence.toFixed(2),
      confidenceBand: band,
    },
  })
  return row.id
}

function aggregateConfidenceByField(extraction: BuildDraftsInput['extraction']): Record<string, number> {
  // Union across products, taking the max per field. Gives callers a
  // quick "how confident were we on this field anywhere" view.
  const out: Record<string, number> = {}
  for (const product of extraction.products) {
    for (const [field, value] of Object.entries(product.confidenceByField)) {
      const prev = out[field] ?? 0
      if (value > prev) out[field] = value
    }
  }
  return out
}

async function defaultKillProbe(ctx: {
  correlationId: string
  messageId: string
}): Promise<boolean> {
  return isProcessingKilled(undefined, {
    correlationId: ctx.correlationId,
    messageId: ctx.messageId,
    stage: 'rules-extractor',
    jobKind: 'ingestion.processing.build-drafts',
  })
}
