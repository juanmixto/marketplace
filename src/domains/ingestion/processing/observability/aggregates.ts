import type {
  AggregatesTimeWindow,
  ConfidenceBandName,
  DedupeKindName,
  DedupeRiskName,
  DraftStatusName,
  MessageClassName,
  ObservabilityDb,
  ProcessingAggregates,
  ReviewKindName,
  ReviewStateName,
} from './types'

/**
 * Aggregate observability for the Phase 2 processing pipeline.
 *
 * Pure function: takes a DB handle + a time window, returns the
 * counts operators need to answer "is the pipeline healthy?".
 * Nothing fancy — just `count` / `groupBy` on the same models the
 * workers populate. No raw SQL, no joins we don't have to do; the
 * goal is "simple but consistent" (#695 review, condition 1).
 *
 * The window is always `[from, to)`: inclusive of `from`, exclusive
 * of `to`. That matches how `createdAt >= from AND createdAt < to`
 * works in Prisma and avoids the classic double-counting boundary
 * bug at minute-rollover.
 */

export async function computeProcessingAggregates(
  db: ObservabilityDb,
  window: AggregatesTimeWindow,
): Promise<ProcessingAggregates> {
  const whereInWindow = {
    createdAt: { gte: window.from, lt: window.to },
  }

  const [
    classificationRows,
    rulesExtractions,
    llmExtractions,
    productClassifications,
    draftsTotal,
    draftsByStatusRows,
    draftsByBandRows,
    candidatesTotal,
    autoMerged,
    enqueuedForReview,
    candidatesByKindRows,
    candidatesByRiskRows,
    reviewTotal,
    reviewByStateRows,
    reviewByKindRows,
  ] = await Promise.all([
    db.ingestionExtractionResult.groupBy({
      by: ['classification'],
      where: whereInWindow,
      _count: true,
    }),
    db.ingestionExtractionResult.count({
      where: { ...whereInWindow, engine: 'RULES' },
    }),
    db.ingestionExtractionResult.count({
      where: { ...whereInWindow, engine: 'LLM' },
    }),
    // Only PRODUCT extractions include their drafts — the skip
    // metric compares against drafts produced per extraction.
    db.ingestionExtractionResult.findMany({
      where: { ...whereInWindow, classification: 'PRODUCT' },
      select: { id: true, productDrafts: { select: { id: true } } },
    }),
    db.ingestionProductDraft.count({ where: whereInWindow }),
    db.ingestionProductDraft.groupBy({
      by: ['status'],
      where: whereInWindow,
      _count: true,
    }),
    db.ingestionProductDraft.groupBy({
      by: ['confidenceBand'],
      where: whereInWindow,
      _count: true,
    }),
    db.ingestionDedupeCandidate.count({ where: whereInWindow }),
    db.ingestionDedupeCandidate.count({
      where: { ...whereInWindow, autoApplied: true },
    }),
    db.ingestionDedupeCandidate.count({
      where: { ...whereInWindow, autoApplied: false },
    }),
    db.ingestionDedupeCandidate.groupBy({
      by: ['kind'],
      where: whereInWindow,
      _count: true,
    }),
    db.ingestionDedupeCandidate.groupBy({
      by: ['riskClass'],
      where: whereInWindow,
      _count: true,
    }),
    db.ingestionReviewQueueItem.count({ where: whereInWindow }),
    db.ingestionReviewQueueItem.groupBy({
      by: ['state'],
      where: whereInWindow,
      _count: true,
    }),
    db.ingestionReviewQueueItem.groupBy({
      by: ['kind'],
      where: whereInWindow,
      _count: true,
    }),
  ])

  const classificationBuckets: Record<MessageClassName, number> = {
    PRODUCT: 0,
    CONVERSATION: 0,
    SPAM: 0,
    OTHER: 0,
  }
  for (const row of classificationRows) {
    if (row.classification === null) continue
    if (row.classification in classificationBuckets) {
      classificationBuckets[row.classification as MessageClassName] = row._count
    }
  }

  const skipProductCount = productClassifications.length
  const skipWithZeroDrafts = productClassifications.filter(
    (e) => e.productDrafts.length === 0,
  ).length

  return {
    window,
    classification: classificationBuckets,
    extractions: {
      total: rulesExtractions + llmExtractions,
      byEngine: { RULES: rulesExtractions, LLM: llmExtractions },
    },
    drafts: {
      total: draftsTotal,
      byStatus: bucketByKey<DraftStatusName>(draftsByStatusRows, 'status', [
        'PENDING',
        'APPROVED',
        'REJECTED',
        'TOMBSTONED',
      ]),
      byConfidenceBand: bucketByKey<ConfidenceBandName>(
        draftsByBandRows,
        'confidenceBand',
        ['LOW', 'MEDIUM', 'HIGH'],
      ),
    },
    skip: {
      productClassifications: skipProductCount,
      withZeroDrafts: skipWithZeroDrafts,
      ratio: ratio(skipWithZeroDrafts, skipProductCount),
    },
    dedupe: {
      candidatesTotal,
      byKind: bucketByKey<DedupeKindName>(candidatesByKindRows, 'kind', [
        'STRONG',
        'HEURISTIC',
        'SIMILARITY',
      ]),
      byRisk: bucketByKey<DedupeRiskName>(candidatesByRiskRows, 'riskClass', [
        'LOW',
        'MEDIUM',
        'HIGH',
      ]),
      autoMerged,
      enqueuedForReview,
      autoMergeRatio: ratio(autoMerged, candidatesTotal),
      reviewRatio: ratio(enqueuedForReview, candidatesTotal),
    },
    reviewQueue: {
      total: reviewTotal,
      byState: bucketByKey<ReviewStateName>(reviewByStateRows, 'state', [
        'ENQUEUED',
        'AUTO_RESOLVED',
      ]),
      byKind: bucketByKey<ReviewKindName>(reviewByKindRows, 'kind', [
        'PRODUCT_DRAFT',
        'VENDOR_DRAFT',
        'DEDUPE_CANDIDATE',
      ]),
    },
  }
}

function bucketByKey<K extends string>(
  rows: Array<Record<string, unknown> & { _count: number }>,
  field: string,
  keys: readonly K[],
): Record<K, number> {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>
  for (const row of rows) {
    const value = row[field]
    if (typeof value === 'string' && (keys as readonly string[]).includes(value)) {
      out[value as K] = row._count
    }
  }
  return out
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 10_000) / 10_000
}
