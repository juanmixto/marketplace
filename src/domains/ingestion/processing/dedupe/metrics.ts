import type { DedupeScanResult } from './types'

/**
 * Minimal per-scan metrics view. PR-H turns these into aggregate
 * queries against the full DB; here we only reduce the per-scan
 * result so the worker can log a useful one-liner.
 */

export interface DedupeScanMetrics {
  candidatesCreated: number
  autoMerged: number
  enqueuedForReview: number
  /** 0 when no candidates created. Ratio of auto-merges to total candidates. */
  autoMergeRatio: number
  /** 0 when no candidates. Ratio of review-queue enqueues to total candidates. */
  reviewRatio: number
  byKind: Record<'STRONG' | 'HEURISTIC' | 'SIMILARITY', number>
  byRisk: Record<'LOW' | 'MEDIUM' | 'HIGH', number>
}

export function dedupeMetricsFrom(result: DedupeScanResult): DedupeScanMetrics {
  const { candidatesCreated, autoMerged, enqueuedForReview, byKind, byRisk } =
    result
  const autoMergeRatio =
    candidatesCreated === 0 ? 0 : autoMerged / candidatesCreated
  const reviewRatio =
    candidatesCreated === 0 ? 0 : enqueuedForReview / candidatesCreated
  return {
    candidatesCreated,
    autoMerged,
    enqueuedForReview,
    autoMergeRatio,
    reviewRatio,
    byKind,
    byRisk,
  }
}
