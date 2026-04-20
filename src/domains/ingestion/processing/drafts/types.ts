import type { ExtractionPayload } from '../extractor/schema'

/**
 * Narrow DB surface for the drafts builder. Only the Prisma methods
 * we actually call live here; test fakes implement just this subset.
 */

export interface ClassifierPersistenceInput {
  kind: 'PRODUCT' | 'CONVERSATION' | 'SPAM' | 'OTHER'
  confidence: number
  confidenceBand: 'LOW' | 'MEDIUM' | 'HIGH'
  signals: unknown // serialised ClassifierSignal[]
}

export interface BuildDraftsInput {
  messageId: string
  extractorVersion: string
  classification: ClassifierPersistenceInput
  extraction: ExtractionPayload
  inputSnapshot: unknown
  correlationId: string
}

export interface BuildDraftsResult {
  status: 'OK' | 'KILLED' | 'SKIPPED_NON_PRODUCT'
  extractionResultId: string | null
  productDraftIds: string[]
  vendorDraftId: string | null
  reviewItemsEnqueued: number
  correlationId: string
}

export interface DraftsBuilderDb {
  ingestionExtractionResult: {
    upsert(args: {
      where: { messageId_extractorVersion: { messageId: string; extractorVersion: string } }
      create: {
        messageId: string
        engine: 'RULES'
        extractorVersion: string
        schemaVersion: number
        inputSnapshot: unknown
        payload: unknown
        confidenceOverall: number | string
        confidenceBand: 'LOW' | 'MEDIUM' | 'HIGH'
        confidenceByField: unknown
        classification: 'PRODUCT' | 'CONVERSATION' | 'SPAM' | 'OTHER'
        correlationId: string
      }
      update: Record<string, never>
    }): Promise<{ id: string }>
  }
  ingestionVendorDraft: {
    upsert(args: {
      where: { externalId_extractorVersion: { externalId: string; extractorVersion: string } }
      create: {
        externalId: string
        displayName: string
        inferredFromMessageIds: unknown
        extractorVersion: string
        confidenceOverall: number | string
        confidenceBand: 'LOW' | 'MEDIUM' | 'HIGH'
      }
      update: Record<string, never>
    }): Promise<{ id: string }>
    create(args: {
      data: {
        externalId: null
        displayName: string
        inferredFromMessageIds: unknown
        extractorVersion: string
        confidenceOverall: number | string
        confidenceBand: 'LOW' | 'MEDIUM' | 'HIGH'
      }
    }): Promise<{ id: string }>
  }
  ingestionProductDraft: {
    upsert(args: {
      where: {
        sourceMessageId_extractorVersion_productOrdinal: {
          sourceMessageId: string
          extractorVersion: string
          productOrdinal: number
        }
      }
      create: {
        sourceMessageId: string
        sourceExtractionId: string
        extractorVersion: string
        productOrdinal: number
        vendorDraftId: string | null
        confidenceOverall: number | string
        confidenceBand: 'LOW' | 'MEDIUM' | 'HIGH'
        productName: string | null
        categorySlug: string | null
        unit: string | null
        weightGrams: number | null
        priceCents: number | null
        currencyCode: string | null
        availability: string | null
        rawFieldsSeen: unknown
      }
      update: Record<string, never>
    }): Promise<{ id: string; productOrdinal: number }>
  }
  ingestionReviewQueueItem: {
    upsert(args: {
      where: { kind_targetId: { kind: 'PRODUCT_DRAFT' | 'VENDOR_DRAFT' | 'DEDUPE_CANDIDATE'; targetId: string } }
      create: {
        kind: 'PRODUCT_DRAFT' | 'VENDOR_DRAFT' | 'DEDUPE_CANDIDATE'
        targetId: string
        priority: number
      }
      update: Record<string, never>
    }): Promise<{ id: string }>
  }
  $transaction<T>(fn: (tx: DraftsBuilderDb) => Promise<T>): Promise<T>
}
