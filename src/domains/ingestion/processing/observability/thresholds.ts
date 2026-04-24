import type { ProcessingAggregates } from './types'

/**
 * Phase 2 acceptance thresholds. These are **orientative baselines**
 * for a healthy rules-only pipeline — not hard gates. Exceeding one
 * does not mean the subsystem is broken; it means an operator should
 * look at the logs before enabling the next stage or flipping any
 * feature flag.
 *
 * Every number here is documented in `docs/ingestion/processing.md §
 * Acceptance thresholds (Phase 2 baseline)`. Do not move them without
 * updating the doc in the same commit.
 */

export const PHASE_2_THRESHOLDS = {
  /** Skip ratio above this means the extractor rejected too many
   *  PRODUCT-classified messages — rules may be too strict. */
  skipRatioMax: 0.2,
  /** Auto-merge ratio above this means the STRONG rule is firing on
   *  messages it shouldn't, or the pipeline is re-processing the same
   *  input under a new extractor version without idempotency. */
  autoMergeRatioMax: 0.35,
  /** Review ratio above this means MEDIUM + HIGH candidates dominate
   *  and the human review queue will not clear. */
  reviewRatioMax: 0.6,
  /** Review queue total above this means the queue is growing faster
   *  than it can be drained by the Phase 3 admin UI (once it lands). */
  queueEnqueuedMax: 500,
  /** Confidence-band balance hint: if MEDIUM + LOW dominate over HIGH
   *  beyond this ratio, the extractor is too uncertain to trust at
   *  scale — investigate before enabling LLM (Phase 2.5). */
  lowMediumConfidenceRatioMax: 0.8,
} as const

export type ThresholdName = keyof typeof PHASE_2_THRESHOLDS

export interface ThresholdBreach {
  name: ThresholdName
  observed: number
  limit: number
  hint: string
}

/**
 * Pure function: takes an aggregate snapshot and returns the breached
 * thresholds (empty array when healthy). Operators call this after
 * running `computeProcessingAggregates`; runbook queries hook into
 * the same output.
 */
export function evaluateThresholds(
  aggregates: ProcessingAggregates,
): ThresholdBreach[] {
  const breaches: ThresholdBreach[] = []

  if (aggregates.skip.ratio > PHASE_2_THRESHOLDS.skipRatioMax) {
    breaches.push({
      name: 'skipRatioMax',
      observed: aggregates.skip.ratio,
      limit: PHASE_2_THRESHOLDS.skipRatioMax,
      hint:
        'Extractor rejects too many PRODUCT-classified messages. Inspect recent ' +
        '`ingestion.processing.drafts.classified_product_with_no_extractable_fields` ' +
        'log lines and consider loosening rules OR leaving Phase 2.5 LLM behind.',
    })
  }
  if (aggregates.dedupe.autoMergeRatio > PHASE_2_THRESHOLDS.autoMergeRatioMax) {
    breaches.push({
      name: 'autoMergeRatioMax',
      observed: aggregates.dedupe.autoMergeRatio,
      limit: PHASE_2_THRESHOLDS.autoMergeRatioMax,
      hint:
        'STRONG auto-merge rule may be firing too often. Check for accidental ' +
        'extractor-version bumps or producers re-posting identical content.',
    })
  }
  if (aggregates.dedupe.reviewRatio > PHASE_2_THRESHOLDS.reviewRatioMax) {
    breaches.push({
      name: 'reviewRatioMax',
      observed: aggregates.dedupe.reviewRatio,
      limit: PHASE_2_THRESHOLDS.reviewRatioMax,
      hint:
        'MEDIUM + HIGH candidates dominate. Human review queue will not clear ' +
        'until the Phase 3 admin UI is live — flip feat-ingestion-dedupe off if it grows.',
    })
  }
  if (
    aggregates.reviewQueue.byState.ENQUEUED > PHASE_2_THRESHOLDS.queueEnqueuedMax
  ) {
    breaches.push({
      name: 'queueEnqueuedMax',
      observed: aggregates.reviewQueue.byState.ENQUEUED,
      limit: PHASE_2_THRESHOLDS.queueEnqueuedMax,
      hint:
        'Pending review queue larger than the Phase 3 admin UI is expected to ' +
        'handle at launch. Consider pausing dedupe by flipping feat-ingestion-dedupe.',
    })
  }
  const lowMedium =
    aggregates.drafts.byConfidenceBand.LOW +
    aggregates.drafts.byConfidenceBand.MEDIUM
  const lowMediumRatio =
    aggregates.drafts.total === 0 ? 0 : lowMedium / aggregates.drafts.total
  if (lowMediumRatio > PHASE_2_THRESHOLDS.lowMediumConfidenceRatioMax) {
    breaches.push({
      name: 'lowMediumConfidenceRatioMax',
      observed: lowMediumRatio,
      limit: PHASE_2_THRESHOLDS.lowMediumConfidenceRatioMax,
      hint:
        'Drafts cluster in LOW + MEDIUM confidence. Rules are uncertain at scale; ' +
        'investigate before enabling Phase 2.5 LLM as a crutch.',
    })
  }
  return breaches
}
