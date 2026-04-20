export {
  classifyProductDedupe,
  classifyVendorDedupe,
  normaliseProductName,
  weightBucket,
  RISK_FOR_KIND,
  type DedupeClassification,
  type DedupeSignal,
  type DedupeKind,
  type DedupeRisk,
  type ProductDraftRow,
  type VendorDraftRow,
} from './rules'

export {
  scanDedupe,
  type DedupeScannerDeps,
} from './scanner'

export type {
  DedupeScanInput,
  DedupeScanResult,
  DedupeScannerDb,
} from './types'

export {
  dedupeMetricsFrom,
  type DedupeScanMetrics,
} from './metrics'
