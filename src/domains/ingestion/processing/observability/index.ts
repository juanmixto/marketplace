export {
  computeProcessingAggregates,
} from './aggregates'

export type {
  AggregatesTimeWindow,
  ObservabilityDb,
  ProcessingAggregates,
  MessageClassName,
  ConfidenceBandName,
  DraftStatusName,
  DedupeKindName,
  DedupeRiskName,
  ReviewStateName,
  ReviewKindName,
} from './types'

export {
  PHASE_2_THRESHOLDS,
  evaluateThresholds,
  type ThresholdBreach,
  type ThresholdName,
} from './thresholds'
