/**
 * Public types for the Phase 2 processing layer.
 *
 * Handler signatures, job payload shapes, and the few shared value
 * objects (confidence band, extractor version) are re-exported from
 * the top-level ingestion barrel. Internal classifier / extractor
 * tables, rule weights, and vendor inference heuristics stay in
 * their subfolders and are not part of the public surface.
 */

export type { ConfidenceBand } from './confidence'
export {
  CONFIDENCE_BAND_THRESHOLDS,
  confidenceBandFor,
  normaliseConfidence,
  ConfidenceRangeError,
} from './confidence'

export {
  CURRENT_RULES_EXTRACTOR_VERSION,
  isRulesExtractorVersion,
  isLlmExtractorVersion,
} from './extractor-version'

export {
  PROCESSING_KILL_FLAG,
  PROCESSING_CLASSIFIER_FLAG,
  PROCESSING_RULES_EXTRACTOR_FLAG,
  PROCESSING_DEDUPE_FLAG,
  isProcessingKilled,
  isStageEnabled,
  type ProcessingStage,
} from './flags'

/**
 * Job kinds for the processing pipeline. Actual handler modules land
 * in PR-F and PR-G; the constants live here so the queue wrapper and
 * admin tooling can reference them without depending on the handler
 * implementations.
 */
export const PROCESSING_JOB_KINDS = {
  classify: 'ingestion.processing.classify',
  extractRules: 'ingestion.processing.extract.rules',
  buildDrafts: 'ingestion.processing.build-drafts',
  dedupeDrafts: 'ingestion.processing.dedupe-drafts',
} as const

export type ProcessingJobKind =
  (typeof PROCESSING_JOB_KINDS)[keyof typeof PROCESSING_JOB_KINDS]
