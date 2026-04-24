import { logger } from '@/lib/logger'
import { isStageEnabled } from '../flags'
import { classifyProductDedupe, classifyVendorDedupe } from './rules'
import type {
  DedupeClassification,
  DedupeKind,
  DedupeRisk,
  ProductDraftRow,
} from './rules'
import type {
  DedupeScanInput,
  DedupeScanResult,
  DedupeScannerDb,
} from './types'

/**
 * Dedupe scanner + builder.
 *
 * Given a freshly built `ProductDraft`, compare it pairwise against
 * every other canonical draft at the same `extractorVersion`,
 * classify each pair, persist the candidate rows, and — for STRONG
 * (LOW-risk) matches only — apply the non-destructive auto-merge via
 * `canonicalDraftId` / `duplicateOf`.
 *
 * Invariants (pinned by tests):
 *
 *   1. Kill-switch / stage-flag first. Stage = `dedupe`. If the
 *      umbrella kill or the stage flag says no, the scanner returns
 *      `KILLED` with zero DB writes.
 *   2. Drafts that already participate in a merge chain
 *      (`canonicalDraftId != null`) are never re-compared. Dedupe
 *      always compares canonical against canonical.
 *   3. Auto-merge only for kind=STRONG. MEDIUM / HIGH candidates are
 *      written with `autoApplied=false` and enqueued into the review
 *      queue with `kind=DEDUPE_CANDIDATE`.
 *   4. Non-destructive: we update the NEWER draft to point at the
 *      OLDER canonical (via both `canonicalDraftId` and
 *      `duplicateOf`). The older row stays intact as the survivor.
 *   5. Transaction: candidate insert + canonical pointer update +
 *      review-queue state transition run in one `$transaction`. A
 *      crash either commits everything or nothing — never leaves a
 *      draft pointing at a candidate that was rolled back.
 */

const LOG_SCOPE = 'ingestion.processing.dedupe'

export interface DedupeScannerDeps {
  db: DedupeScannerDb
  now: () => Date
  // Compared drafts are bounded to avoid pathological scans. Default
  // keeps us well below the pgboss job timeout at Phase 2 volumes.
  maxCandidatesPerScan?: number
  isStageEnabledFn?: (
    correlationId: string,
    productDraftId: string,
  ) => Promise<boolean>
}

const DEFAULT_MAX_CANDIDATES = 500

export async function scanDedupe(
  input: DedupeScanInput,
  deps: DedupeScannerDeps,
): Promise<DedupeScanResult> {
  const enabled = await (deps.isStageEnabledFn ?? defaultStageProbe)(
    input.correlationId,
    input.productDraftId,
  )
  if (!enabled) {
    return emptyResult(input, 'KILLED')
  }

  const draft = await deps.db.ingestionProductDraft.findUnique({
    where: { id: input.productDraftId },
  })
  if (!draft) {
    logger.warn(`${LOG_SCOPE}.draft_not_found`, {
      productDraftId: input.productDraftId,
      correlationId: input.correlationId,
    })
    return emptyResult(input, 'DRAFT_NOT_FOUND')
  }
  if (draft.canonicalDraftId !== null) {
    // Already part of a chain; nothing to do.
    return emptyResult(input, 'OK')
  }

  const maxCandidates = deps.maxCandidatesPerScan ?? DEFAULT_MAX_CANDIDATES
  const peers = await deps.db.ingestionProductDraft.findMany({
    where: {
      id: { not: draft.id },
      canonicalDraftId: null,
      extractorVersion: draft.extractorVersion,
    },
    orderBy: { createdAt: 'asc' },
    take: maxCandidates,
  })

  const classifications: DedupeClassification[] = []
  const byKind: Record<DedupeKind, number> = { STRONG: 0, HEURISTIC: 0, SIMILARITY: 0 }
  const byRisk: Record<DedupeRisk, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 }
  let candidatesCreated = 0
  let autoMerged = 0
  let enqueuedForReview = 0

  for (const peer of peers) {
    const classification = classifyProductDedupe(draft, peer)
    if (!classification) continue
    classifications.push(classification)
    byKind[classification.kind] += 1
    byRisk[classification.risk] += 1

    const persistResult = await deps.db.$transaction(async (tx) => {
      const candidateRow = await tx.ingestionDedupeCandidate.upsert({
        where: {
          leftDraftId_rightDraftId_kind: {
            leftDraftId: draft.id,
            rightDraftId: peer.id,
            kind: classification.kind,
          },
        },
        create: {
          leftDraftId: draft.id,
          rightDraftId: peer.id,
          kind: classification.kind,
          riskClass: classification.risk,
          reasonJson: {
            reason: classification.reason,
            score: classification.score,
            signals: classification.signals,
          },
          autoApplied: false,
          autoAppliedAt: null,
        },
        update: {},
      })
      // Auto-merge ONLY for STRONG matches — the LOW-only policy.
      const shouldAutoMerge =
        classification.kind === 'STRONG' && classification.risk === 'LOW'
      if (shouldAutoMerge && !candidateRow.autoApplied) {
        // Point the newer draft at the older canonical. Never touch
        // the other row's canonical pointer.
        await tx.ingestionProductDraft.update({
          where: { id: draft.id },
          data: {
            canonicalDraftId: peer.id,
            duplicateOf: peer.id,
          },
        })
        // Transition the newer draft's existing review queue row
        // (created in PR-F by the drafts builder) to AUTO_RESOLVED.
        await tx.ingestionReviewQueueItem.update({
          where: {
            kind_targetId: { kind: 'PRODUCT_DRAFT', targetId: draft.id },
          },
          data: {
            state: 'AUTO_RESOLVED',
            autoResolvedAt: deps.now(),
            autoResolvedReason: `dedupe:${classification.reason}`,
          },
        })
        // Flip `autoApplied` on the candidate row we just inserted
        // so a second scan pass cannot re-trigger the auto-merge
        // path and so the admin panel surfaces the history cleanly.
        await tx.ingestionDedupeCandidate.update({
          where: { id: candidateRow.id },
          data: { autoApplied: true, autoAppliedAt: deps.now() },
        })
        return { autoMerged: true, enqueuedForReview: false }
      }
      // MEDIUM / HIGH: enqueue the candidate for human review.
      if (!shouldAutoMerge) {
        await tx.ingestionReviewQueueItem.upsert({
          where: {
            kind_targetId: {
              kind: 'DEDUPE_CANDIDATE',
              targetId: candidateRow.id,
            },
          },
          create: {
            kind: 'DEDUPE_CANDIDATE',
            targetId: candidateRow.id,
            priority: classification.risk === 'HIGH' ? 100 : 50,
          },
          update: {},
        })
        return { autoMerged: false, enqueuedForReview: true }
      }
      return { autoMerged: false, enqueuedForReview: false }
    })

    candidatesCreated += 1
    if (persistResult.autoMerged) autoMerged += 1
    if (persistResult.enqueuedForReview) enqueuedForReview += 1

    // Stop scanning once we've auto-merged this draft: it is no
    // longer canonical and further comparisons against it are
    // meaningless and would pile up STRONG candidates.
    if (persistResult.autoMerged) break
  }

  // Vendor dedupe only fires when the product draft has a vendor and
  // that vendor has an externalId. Kept minimal in Phase 2.
  const vendorAutoMerged = await tryVendorAutoMerge(draft, deps)
  if (vendorAutoMerged) {
    byKind.STRONG += 1
    byRisk.LOW += 1
    autoMerged += 1
    candidatesCreated += 1
  }

  logger.info(`${LOG_SCOPE}.scan_complete`, {
    productDraftId: input.productDraftId,
    candidatesCreated,
    autoMerged,
    enqueuedForReview,
    byKind,
    byRisk,
    correlationId: input.correlationId,
  })

  return {
    status: 'OK',
    productDraftId: input.productDraftId,
    candidatesCreated,
    autoMerged,
    enqueuedForReview,
    byKind,
    byRisk,
    classifications,
    correlationId: input.correlationId,
  }
}

async function tryVendorAutoMerge(
  draft: ProductDraftRow,
  deps: DedupeScannerDeps,
): Promise<boolean> {
  if (!draft.vendorDraftId) return false
  const vendor = await deps.db.ingestionVendorDraft.findUnique({
    where: { id: draft.vendorDraftId },
  })
  if (!vendor || !vendor.externalId || vendor.canonicalDraftId !== null) return false
  // Vendors identified by externalId MUST merge across extractor
  // versions — their identity is the externalId, not the rule set
  // that produced the row. Product drafts stay per-version, vendors
  // collapse.
  const peers = await deps.db.ingestionVendorDraft.findMany({
    where: {
      id: { not: vendor.id },
      canonicalDraftId: null,
      externalId: { not: null },
    },
    take: 50,
  })
  for (const peer of peers) {
    const classification = classifyVendorDedupe(vendor, peer)
    if (!classification) continue
    if (classification.kind !== 'STRONG') continue
    // Auto-merge vendor: newer → older canonical.
    await deps.db.$transaction(async (tx) => {
      await tx.ingestionDedupeCandidate.upsert({
        where: {
          leftDraftId_rightDraftId_kind: {
            leftDraftId: vendor.id,
            rightDraftId: peer.id,
            kind: classification.kind,
          },
        },
        create: {
          leftDraftId: vendor.id,
          rightDraftId: peer.id,
          kind: classification.kind,
          riskClass: classification.risk,
          reasonJson: {
            reason: classification.reason,
            score: classification.score,
            signals: classification.signals,
          },
          autoApplied: true,
          autoAppliedAt: deps.now(),
        },
        update: {},
      })
      await tx.ingestionVendorDraft.update({
        where: { id: vendor.id },
        data: { canonicalDraftId: peer.id, duplicateOf: peer.id },
      })
    })
    return true
  }
  return false
}

function emptyResult(
  input: DedupeScanInput,
  status: DedupeScanResult['status'],
): DedupeScanResult {
  return {
    status,
    productDraftId: input.productDraftId,
    candidatesCreated: 0,
    autoMerged: 0,
    enqueuedForReview: 0,
    byKind: { STRONG: 0, HEURISTIC: 0, SIMILARITY: 0 },
    byRisk: { LOW: 0, MEDIUM: 0, HIGH: 0 },
    classifications: [],
    correlationId: input.correlationId,
  }
}

async function defaultStageProbe(
  correlationId: string,
  productDraftId: string,
): Promise<boolean> {
  return isStageEnabled('dedupe', undefined, {
    correlationId,
    draftId: productDraftId,
    stage: 'dedupe',
    jobKind: 'ingestion.processing.dedupe-drafts',
  })
}
