import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeProcessingAggregates,
  evaluateThresholds,
  PHASE_2_THRESHOLDS,
  type ObservabilityDb,
  type ProcessingAggregates,
} from '@/domains/ingestion'

/**
 * In-memory fake DB: lets us assert the aggregator's
 * bucket-filling, ratio math, and threshold-breach routing without
 * needing Postgres. Integration against the real DB is in
 * `test/integration/ingestion-cycle-end-to-end.test.ts`.
 */

function createFake(data: {
  extractions?: Array<{ classification: string | null; engine: 'RULES' | 'LLM' }>
  productsPerExtraction?: number[] // parallel array: products per PRODUCT extraction
  drafts?: Array<{ status: string; confidenceBand: string }>
  candidates?: Array<{ kind: string; riskClass: string; autoApplied: boolean }>
  reviewItems?: Array<{ state: string; kind: string }>
}): ObservabilityDb {
  const ex = data.extractions ?? []
  const productExtractions = ex
    .filter((e) => e.classification === 'PRODUCT')
    .map((_, i) => ({
      id: `ex-${i}`,
      productDrafts: Array.from(
        { length: data.productsPerExtraction?.[i] ?? 0 },
        (__, j) => ({ id: `pd-${i}-${j}` }),
      ),
    }))

  const groupCount = <T extends Record<string, unknown>>(
    rows: T[],
    key: keyof T,
  ) => {
    const map = new Map<string, number>()
    for (const r of rows) {
      const v = String(r[key])
      map.set(v, (map.get(v) ?? 0) + 1)
    }
    return [...map.entries()].map(([k, v]) => ({ [key]: k, _count: v })) as Array<
      Record<string, unknown> & { _count: number }
    >
  }

  return {
    ingestionExtractionResult: {
      async groupBy(args) {
        return groupCount(ex, args.by[0]) as Array<{ classification: string | null; _count: number }>
      },
      async count(args) {
        const engine = args.where.engine
        return ex.filter((e) => (engine ? e.engine === engine : true)).length
      },
      async findMany() {
        return productExtractions
      },
    },
    ingestionProductDraft: {
      async count() {
        return (data.drafts ?? []).length
      },
      async groupBy(args) {
        return groupCount(data.drafts ?? [], args.by[0]) as never
      },
      async findMany() {
        // rules-1.1.0 productName avg: fake rows have no productName
        // field in this test harness, return null entries so the
        // average calculation handles the no-data case.
        return (data.drafts ?? []).map(() => ({ productName: null }))
      },
    },
    ingestionDedupeCandidate: {
      async count(args) {
        if ('autoApplied' in (args.where as object)) {
          const want = (args.where as { autoApplied: boolean }).autoApplied
          return (data.candidates ?? []).filter((c) => c.autoApplied === want)
            .length
        }
        return (data.candidates ?? []).length
      },
      async groupBy(args) {
        return groupCount(data.candidates ?? [], args.by[0]) as never
      },
    },
    ingestionReviewQueueItem: {
      async count() {
        return (data.reviewItems ?? []).length
      },
      async groupBy(args) {
        return groupCount(data.reviewItems ?? [], args.by[0]) as never
      },
    },
  }
}

const window = {
  from: new Date('2026-04-20T00:00:00Z'),
  to: new Date('2026-04-21T00:00:00Z'),
}

test('aggregates: empty DB returns zeros everywhere', async () => {
  const result = await computeProcessingAggregates(createFake({}), window)
  assert.equal(result.classification.PRODUCT, 0)
  assert.equal(result.drafts.total, 0)
  assert.equal(result.skip.ratio, 0)
  assert.equal(result.dedupe.autoMergeRatio, 0)
  assert.equal(result.reviewQueue.total, 0)
})

test('aggregates: classification buckets fill for every kind', async () => {
  const result = await computeProcessingAggregates(
    createFake({
      extractions: [
        { classification: 'PRODUCT', engine: 'RULES' },
        { classification: 'PRODUCT', engine: 'RULES' },
        { classification: 'CONVERSATION', engine: 'RULES' },
        { classification: 'SPAM', engine: 'RULES' },
        { classification: 'OTHER', engine: 'RULES' },
      ],
      productsPerExtraction: [1, 1],
    }),
    window,
  )
  assert.deepEqual(result.classification, {
    PRODUCT: 2,
    PRODUCT_NO_PRICE: 0,
    CONVERSATION: 1,
    SPAM: 1,
    OTHER: 1,
  })
  assert.equal(result.extractions.total, 5)
  assert.equal(result.extractions.byEngine.RULES, 5)
  assert.equal(result.extractions.byEngine.LLM, 0)
})

test('aggregates: skip ratio counts PRODUCT extractions with zero drafts', async () => {
  const result = await computeProcessingAggregates(
    createFake({
      extractions: [
        { classification: 'PRODUCT', engine: 'RULES' },
        { classification: 'PRODUCT', engine: 'RULES' },
        { classification: 'PRODUCT', engine: 'RULES' },
        { classification: 'PRODUCT', engine: 'RULES' },
      ],
      // Out of 4 PRODUCT extractions, 1 produced drafts, 3 skipped.
      productsPerExtraction: [1, 0, 0, 0],
    }),
    window,
  )
  assert.equal(result.skip.productClassifications, 4)
  assert.equal(result.skip.withZeroDrafts, 3)
  assert.equal(result.skip.ratio, 0.75)
})

test('aggregates: dedupe ratios divide by candidatesTotal correctly', async () => {
  const result = await computeProcessingAggregates(
    createFake({
      candidates: [
        { kind: 'STRONG', riskClass: 'LOW', autoApplied: true },
        { kind: 'STRONG', riskClass: 'LOW', autoApplied: true },
        { kind: 'HEURISTIC', riskClass: 'MEDIUM', autoApplied: false },
        { kind: 'SIMILARITY', riskClass: 'HIGH', autoApplied: false },
      ],
    }),
    window,
  )
  assert.equal(result.dedupe.candidatesTotal, 4)
  assert.equal(result.dedupe.autoMerged, 2)
  assert.equal(result.dedupe.enqueuedForReview, 2)
  assert.equal(result.dedupe.autoMergeRatio, 0.5)
  assert.equal(result.dedupe.reviewRatio, 0.5)
  assert.equal(result.dedupe.byKind.STRONG, 2)
  assert.equal(result.dedupe.byRisk.LOW, 2)
})

// ─── Thresholds ──────────────────────────────────────────────────────────────

function healthyAggregates(): ProcessingAggregates {
  return {
    window,
    classification: { PRODUCT: 10, PRODUCT_NO_PRICE: 0, CONVERSATION: 5, SPAM: 1, OTHER: 4 },
    extractions: { total: 20, byEngine: { RULES: 20, LLM: 0 } },
    drafts: {
      total: 10,
      byStatus: { PENDING: 10, APPROVED: 0, REJECTED: 0, TOMBSTONED: 0 },
      byConfidenceBand: { LOW: 1, MEDIUM: 2, HIGH: 7 },
      productNameAvgLen: 20,
    },
    skip: { productClassifications: 10, withZeroDrafts: 1, ratio: 0.1 },
    dedupe: {
      candidatesTotal: 10,
      byKind: { STRONG: 1, HEURISTIC: 4, SIMILARITY: 5 },
      byRisk: { LOW: 1, MEDIUM: 4, HIGH: 5 },
      autoMerged: 1,
      enqueuedForReview: 9,
      autoMergeRatio: 0.1,
      reviewRatio: 0.5,
    },
    reviewQueue: {
      total: 19,
      byState: { ENQUEUED: 18, AUTO_RESOLVED: 1 },
      byKind: { PRODUCT_DRAFT: 10, VENDOR_DRAFT: 0, DEDUPE_CANDIDATE: 9, UNEXTRACTABLE_PRODUCT: 0 },
    },
  }
}

test('thresholds: healthy snapshot produces zero breaches', () => {
  const breaches = evaluateThresholds(healthyAggregates())
  assert.equal(breaches.length, 0)
})

test('thresholds: high skip ratio produces a named breach', () => {
  const snap = healthyAggregates()
  snap.skip.ratio = 0.9
  const breaches = evaluateThresholds(snap)
  assert.ok(breaches.some((b) => b.name === 'skipRatioMax'))
})

test('thresholds: runaway queue flags queueEnqueuedMax', () => {
  const snap = healthyAggregates()
  snap.reviewQueue.byState.ENQUEUED = 10_000
  const breaches = evaluateThresholds(snap)
  assert.ok(breaches.some((b) => b.name === 'queueEnqueuedMax'))
  const breach = breaches.find((b) => b.name === 'queueEnqueuedMax')!
  assert.equal(breach.limit, PHASE_2_THRESHOLDS.queueEnqueuedMax)
  assert.equal(breach.observed, 10_000)
})

test('thresholds: LOW+MEDIUM confidence domination flags a breach', () => {
  const snap = healthyAggregates()
  snap.drafts.total = 10
  snap.drafts.byConfidenceBand = { LOW: 5, MEDIUM: 4, HIGH: 1 }
  const breaches = evaluateThresholds(snap)
  assert.ok(breaches.some((b) => b.name === 'lowMediumConfidenceRatioMax'))
})
