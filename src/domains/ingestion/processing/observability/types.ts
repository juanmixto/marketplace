/**
 * Narrow DB surface for the aggregate observability queries.
 * Intentionally tiny so a test fake only has to implement what the
 * aggregator actually reads — and so production just passes the
 * real Prisma client.
 *
 * All counts are post-filter: every query filters by the `from` /
 * `to` window the caller provides. The window is always inclusive of
 * `from` and exclusive of `to` to match SQL BETWEEN semantics around
 * time boundaries (see `processing.md § Observability`).
 */

export interface AggregatesTimeWindow {
  from: Date
  to: Date
}

export interface ObservabilityDb {
  ingestionExtractionResult: {
    groupBy(args: {
      by: ['classification']
      where: { createdAt: { gte: Date; lt: Date } }
      _count: true
    }): Promise<Array<{ classification: string | null; _count: number }>>
    count(args: {
      where: { createdAt: { gte: Date; lt: Date }; engine?: 'RULES' | 'LLM' }
    }): Promise<number>
    findMany(args: {
      where: {
        createdAt: { gte: Date; lt: Date }
        classification: 'PRODUCT'
      }
      select: {
        id: true
        productDrafts: { select: { id: true } }
      }
    }): Promise<Array<{ id: string; productDrafts: Array<{ id: string }> }>>
  }
  ingestionProductDraft: {
    count(args: {
      where: { createdAt: { gte: Date; lt: Date } }
    }): Promise<number>
    groupBy(args: {
      by: ['status'] | ['confidenceBand']
      where: { createdAt: { gte: Date; lt: Date } }
      _count: true
    }): Promise<
      Array<{ status?: string; confidenceBand?: string; _count: number }>
    >
    findMany(args: {
      where: { createdAt: { gte: Date; lt: Date } }
      select: { productName: true }
    }): Promise<Array<{ productName: string | null }>>
  }
  ingestionDedupeCandidate: {
    count(args: {
      where: { createdAt: { gte: Date; lt: Date }; autoApplied?: boolean }
    }): Promise<number>
    groupBy(args: {
      by: ['kind'] | ['riskClass']
      where: { createdAt: { gte: Date; lt: Date } }
      _count: true
    }): Promise<Array<{ kind?: string; riskClass?: string; _count: number }>>
  }
  ingestionReviewQueueItem: {
    count(args: {
      where: { createdAt: { gte: Date; lt: Date } }
    }): Promise<number>
    groupBy(args: {
      by: ['state'] | ['kind']
      where: { createdAt: { gte: Date; lt: Date } }
      _count: true
    }): Promise<Array<{ state?: string; kind?: string; _count: number }>>
  }
}

export type MessageClassName =
  | 'PRODUCT'
  | 'PRODUCT_NO_PRICE'
  | 'CONVERSATION'
  | 'SPAM'
  | 'OTHER'
export type ConfidenceBandName = 'LOW' | 'MEDIUM' | 'HIGH'
export type DraftStatusName = 'PENDING' | 'APPROVED' | 'REJECTED' | 'TOMBSTONED'
export type DedupeKindName = 'STRONG' | 'HEURISTIC' | 'SIMILARITY'
export type DedupeRiskName = 'LOW' | 'MEDIUM' | 'HIGH'
export type ReviewStateName = 'ENQUEUED' | 'AUTO_RESOLVED'
export type ReviewKindName =
  | 'PRODUCT_DRAFT'
  | 'VENDOR_DRAFT'
  | 'DEDUPE_CANDIDATE'
  | 'UNEXTRACTABLE_PRODUCT'

export interface ProcessingAggregates {
  window: AggregatesTimeWindow
  classification: Record<MessageClassName, number>
  extractions: {
    total: number
    byEngine: Record<'RULES' | 'LLM', number>
  }
  drafts: {
    total: number
    byStatus: Record<DraftStatusName, number>
    byConfidenceBand: Record<ConfidenceBandName, number>
    /** rules-1.1.0 quality signal: average length of `productName`
     *  across drafts in the window. Low numbers (< 5 chars) suggest
     *  rules failing to pull a real name; high numbers (> 40) suggest
     *  the rule grabbed a paragraph instead of a title. */
    productNameAvgLen: number
  }
  skip: {
    productClassifications: number
    withZeroDrafts: number
    ratio: number
  }
  dedupe: {
    candidatesTotal: number
    byKind: Record<DedupeKindName, number>
    byRisk: Record<DedupeRiskName, number>
    autoMerged: number
    enqueuedForReview: number
    autoMergeRatio: number
    reviewRatio: number
  }
  reviewQueue: {
    total: number
    byState: Record<ReviewStateName, number>
    byKind: Record<ReviewKindName, number>
  }
}
