import type {
  DedupeClassification,
  ProductDraftRow,
  VendorDraftRow,
} from './rules'

/**
 * Narrow DB surface for the dedupe scanner + builder. Production
 * passes the real Prisma client; tests pass in-memory fakes with
 * exactly these methods.
 */

export interface DedupeScannerDb {
  ingestionProductDraft: {
    findUnique(args: {
      where: { id: string }
    }): Promise<ProductDraftRow | null>
    findMany(args: {
      where: {
        id?: { not: string }
        canonicalDraftId: null
        extractorVersion: string
      }
      orderBy?: { createdAt: 'asc' }
      take?: number
    }): Promise<ProductDraftRow[]>
    update(args: {
      where: { id: string }
      data: { canonicalDraftId: string; duplicateOf: string }
    }): Promise<unknown>
  }
  ingestionVendorDraft: {
    findUnique(args: {
      where: { id: string }
    }): Promise<VendorDraftRow | null>
    findMany(args: {
      where: {
        id?: { not: string }
        canonicalDraftId: null
        externalId: { not: null }
      }
      take?: number
    }): Promise<VendorDraftRow[]>
    update(args: {
      where: { id: string }
      data: { canonicalDraftId: string; duplicateOf: string }
    }): Promise<unknown>
  }
  ingestionDedupeCandidate: {
    upsert(args: {
      where: {
        leftDraftId_rightDraftId_kind: {
          leftDraftId: string
          rightDraftId: string
          kind: 'STRONG' | 'HEURISTIC' | 'SIMILARITY'
        }
      }
      create: {
        leftDraftId: string
        rightDraftId: string
        kind: 'STRONG' | 'HEURISTIC' | 'SIMILARITY'
        riskClass: 'LOW' | 'MEDIUM' | 'HIGH'
        reasonJson: unknown
        autoApplied: boolean
        autoAppliedAt: Date | null
      }
      update: Record<string, never>
    }): Promise<{ id: string; autoApplied: boolean }>
    update(args: {
      where: { id: string }
      data: { autoApplied: true; autoAppliedAt: Date }
    }): Promise<unknown>
  }
  ingestionReviewQueueItem: {
    upsert(args: {
      where: {
        kind_targetId: {
          kind: 'PRODUCT_DRAFT' | 'VENDOR_DRAFT' | 'DEDUPE_CANDIDATE'
          targetId: string
        }
      }
      create: {
        kind: 'PRODUCT_DRAFT' | 'VENDOR_DRAFT' | 'DEDUPE_CANDIDATE'
        targetId: string
        priority: number
      }
      update: Record<string, never>
    }): Promise<{ id: string }>
    update(args: {
      where: {
        kind_targetId: {
          kind: 'PRODUCT_DRAFT' | 'VENDOR_DRAFT' | 'DEDUPE_CANDIDATE'
          targetId: string
        }
      }
      data: {
        state: 'AUTO_RESOLVED'
        autoResolvedAt: Date
        autoResolvedReason: string
      }
    }): Promise<unknown>
  }
  $transaction<T>(fn: (tx: DedupeScannerDb) => Promise<T>): Promise<T>
}

export interface DedupeScanInput {
  /** Id of the freshly built product draft that just landed. */
  productDraftId: string
  correlationId: string
}

export interface DedupeScanResult {
  status: 'OK' | 'KILLED' | 'DRAFT_NOT_FOUND'
  productDraftId: string
  candidatesCreated: number
  autoMerged: number
  enqueuedForReview: number
  byKind: Record<'STRONG' | 'HEURISTIC' | 'SIMILARITY', number>
  byRisk: Record<'LOW' | 'MEDIUM' | 'HIGH', number>
  classifications: DedupeClassification[]
  correlationId: string
}
