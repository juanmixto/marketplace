/**
 * Confidence score contract — frozen for the life of the subsystem.
 *
 * Rules (locked per #679 comment 4281108530, do NOT change later;
 * LLM work in Phase 2.5 must respect these same bands):
 *
 *   - score ∈ [0, 1] — floats stored as Decimal(3,2) in Prisma.
 *   - HIGH   when score ≥ 0.80
 *   - MEDIUM when score ≥ 0.50 and score < 0.80
 *   - LOW    when score < 0.50
 *
 * `confidenceBand` is persisted alongside the raw score so queries
 * never re-derive thresholds; a future shift of the cutoffs would be
 * a visible breaking change, not a silent drift.
 */

export const CONFIDENCE_BAND_THRESHOLDS = {
  HIGH_MIN: 0.8,
  MEDIUM_MIN: 0.5,
} as const

export type ConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH'

export function confidenceBandFor(score: number): ConfidenceBand {
  if (Number.isNaN(score)) {
    throw new ConfidenceRangeError('confidence is NaN')
  }
  if (score < 0 || score > 1) {
    throw new ConfidenceRangeError(
      `confidence ${score} out of [0, 1] range`,
    )
  }
  if (score >= CONFIDENCE_BAND_THRESHOLDS.HIGH_MIN) return 'HIGH'
  if (score >= CONFIDENCE_BAND_THRESHOLDS.MEDIUM_MIN) return 'MEDIUM'
  return 'LOW'
}

export class ConfidenceRangeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfidenceRangeError'
  }
}

/**
 * Round to two decimals so Decimal(3,2) stores a stable value and
 * equality comparisons in tests don't fight floating-point drift.
 */
export function normaliseConfidence(score: number): number {
  if (Number.isNaN(score)) {
    throw new ConfidenceRangeError('confidence is NaN')
  }
  if (score < 0) return 0
  if (score > 1) return 1
  return Math.round(score * 100) / 100
}
