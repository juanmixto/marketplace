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
    draftNames,
    candidatesTotal,
    autoMerged,
    enqueuedForReview,
    candidatesByKindRows,
    candidatesByRiskRows,
    reviewTotal,
    reviewByStateRows,
    reviewByKindRows,
    reuseRows,
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
    }) as Promise<Array<{ id: string; productDrafts: Array<{ id: string }> }>>,
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
    db.ingestionProductDraft.findMany({
      where: whereInWindow,
      select: { productName: true },
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
    db.ingestionExtractionResult.findMany({
      where: whereInWindow,
      select: { classification: true, inputSnapshot: true },
    }) as Promise<Array<{ classification: string | null; inputSnapshot: unknown }>>,
  ])

  const classificationBuckets: Record<MessageClassName, number> = {
    PRODUCT: 0,
    PRODUCT_NO_PRICE: 0,
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

  const { repetition, textLenByClass } = computeReuseStats(reuseRows)

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
      productNameAvgLen: productNameAverageLength(draftNames),
    },
    skip: {
      productClassifications: skipProductCount,
      withZeroDrafts: skipWithZeroDrafts,
      ratio: ratio(skipWithZeroDrafts, skipProductCount),
    },
    repetition,
    textLenByClass,
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
        'UNEXTRACTABLE_PRODUCT',
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

function productNameAverageLength(
  rows: Array<{ productName: string | null }>,
): number {
  const lengths = rows
    .map((r) => (r.productName ?? '').length)
    .filter((n) => n > 0)
  if (lengths.length === 0) return 0
  return Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
}

interface ReuseRow {
  classification: string | null
  inputSnapshot: unknown
}

function normaliseReuseText(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function computeReuseStats(rows: ReuseRow[]): {
  repetition: ProcessingAggregates['repetition']
  textLenByClass: ProcessingAggregates['textLenByClass']
} {
  const keyCounts = new Map<string, number>()
  const textSumByClass: Record<MessageClassName, number> = {
    PRODUCT: 0,
    PRODUCT_NO_PRICE: 0,
    CONVERSATION: 0,
    SPAM: 0,
    OTHER: 0,
  }
  const textCountByClass: Record<MessageClassName, number> = {
    PRODUCT: 0,
    PRODUCT_NO_PRICE: 0,
    CONVERSATION: 0,
    SPAM: 0,
    OTHER: 0,
  }

  for (const row of rows) {
    const snap = row.inputSnapshot as { text?: unknown; tgAuthorId?: unknown } | null
    const text = typeof snap?.text === 'string' ? snap.text : ''
    const author =
      snap?.tgAuthorId === null || snap?.tgAuthorId === undefined
        ? 'null'
        : String(snap.tgAuthorId)
    const normText = normaliseReuseText(text)
    const key = `${author}|${normText}`
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1)

    const cls = (row.classification ?? 'OTHER') as MessageClassName
    if (cls in textSumByClass) {
      textSumByClass[cls] += text.length
      textCountByClass[cls] += 1
    }
  }

  let messagesInRepeatSets = 0
  let distinctRepeatSets = 0
  for (const count of keyCounts.values()) {
    if (count >= 2) {
      messagesInRepeatSets += count
      distinctRepeatSets += 1
    }
  }

  const textLenByClass = {
    PRODUCT: avg(textSumByClass.PRODUCT, textCountByClass.PRODUCT),
    PRODUCT_NO_PRICE: avg(textSumByClass.PRODUCT_NO_PRICE, textCountByClass.PRODUCT_NO_PRICE),
    CONVERSATION: avg(textSumByClass.CONVERSATION, textCountByClass.CONVERSATION),
    SPAM: avg(textSumByClass.SPAM, textCountByClass.SPAM),
    OTHER: avg(textSumByClass.OTHER, textCountByClass.OTHER),
  }

  return {
    repetition: {
      totalMessages: rows.length,
      messagesInRepeatSets,
      distinctRepeatSets,
      ratio: ratio(messagesInRepeatSets, rows.length),
    },
    textLenByClass,
  }
}

function avg(sum: number, count: number): number {
  if (count === 0) return 0
  return Math.round(sum / count)
}
