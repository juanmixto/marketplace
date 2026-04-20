/**
 * Phase 2 observability CLI. Prints a single-snapshot view of the
 * processing pipeline's health: volumes, skip ratio, dedupe buckets,
 * auto-merge / review ratios, review-queue state, and any threshold
 * breaches.
 *
 *   npm run ingestion:metrics -- --since 24h
 *   npm run ingestion:metrics -- --since 7d
 *   npm run ingestion:metrics -- --since 30m
 *
 * No DB writes. Safe to run on prod.
 */

import { db } from '@/lib/db'
import {
  computeProcessingAggregates,
  evaluateThresholds,
  PHASE_2_THRESHOLDS,
  type ObservabilityDb,
} from '@/domains/ingestion'

interface ParsedArgs {
  since: Date
  until: Date
}

function parseSince(raw: string | undefined): Date {
  const now = new Date()
  if (!raw) {
    const fallback = new Date(now)
    fallback.setHours(fallback.getHours() - 24)
    return fallback
  }
  const m = /^(\d+)([mhd])$/.exec(raw)
  if (!m) {
    throw new Error(
      `--since must look like "30m" / "24h" / "7d"; got "${raw}"`,
    )
  }
  const quantity = Number.parseInt(m[1]!, 10)
  const unit = m[2]
  const multiplierMs =
    unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000
  return new Date(now.getTime() - quantity * multiplierMs)
}

function parseArgs(argv: string[]): ParsedArgs {
  const sinceIdx = argv.indexOf('--since')
  const since = parseSince(sinceIdx >= 0 ? argv[sinceIdx + 1] : undefined)
  return { since, until: new Date() }
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(2).padStart(6)}%`
}

async function main() {
  const { since, until } = parseArgs(process.argv.slice(2))

  console.log(
    `ingestion metrics window: ${since.toISOString()} → ${until.toISOString()}`,
  )

  const aggregates = await computeProcessingAggregates(
    db as unknown as ObservabilityDb,
    { from: since, to: until },
  )
  const breaches = evaluateThresholds(aggregates)

  const lines = [
    '',
    'Classification (by kind):',
    ...Object.entries(aggregates.classification).map(
      ([k, v]) => `  ${k.padEnd(14)} ${v}`,
    ),
    '',
    'Extractions:',
    `  total          ${aggregates.extractions.total}`,
    `    RULES        ${aggregates.extractions.byEngine.RULES}`,
    `    LLM          ${aggregates.extractions.byEngine.LLM}   (Phase 2.5 reserved)`,
    '',
    'Drafts:',
    `  total          ${aggregates.drafts.total}`,
    '  by status:',
    ...Object.entries(aggregates.drafts.byStatus).map(
      ([k, v]) => `    ${k.padEnd(12)} ${v}`,
    ),
    '  by confidence band:',
    ...Object.entries(aggregates.drafts.byConfidenceBand).map(
      ([k, v]) => `    ${k.padEnd(12)} ${v}`,
    ),
    '',
    'Skip ratio (PRODUCT classified with zero drafts):',
    `  products       ${aggregates.skip.productClassifications}`,
    `  skipped        ${aggregates.skip.withZeroDrafts}`,
    `  ratio          ${formatPercent(aggregates.skip.ratio)}  (threshold ${formatPercent(PHASE_2_THRESHOLDS.skipRatioMax)})`,
    '',
    'Dedupe:',
    `  candidates     ${aggregates.dedupe.candidatesTotal}`,
    `  byKind         STRONG=${aggregates.dedupe.byKind.STRONG}  HEURISTIC=${aggregates.dedupe.byKind.HEURISTIC}  SIMILARITY=${aggregates.dedupe.byKind.SIMILARITY}`,
    `  byRisk         LOW=${aggregates.dedupe.byRisk.LOW}  MEDIUM=${aggregates.dedupe.byRisk.MEDIUM}  HIGH=${aggregates.dedupe.byRisk.HIGH}`,
    `  auto-merged    ${aggregates.dedupe.autoMerged}  (${formatPercent(aggregates.dedupe.autoMergeRatio)})`,
    `  review-queued  ${aggregates.dedupe.enqueuedForReview}  (${formatPercent(aggregates.dedupe.reviewRatio)})`,
    '',
    'Review queue:',
    `  total          ${aggregates.reviewQueue.total}`,
    `  byState        ENQUEUED=${aggregates.reviewQueue.byState.ENQUEUED}  AUTO_RESOLVED=${aggregates.reviewQueue.byState.AUTO_RESOLVED}`,
    `  byKind         PRODUCT_DRAFT=${aggregates.reviewQueue.byKind.PRODUCT_DRAFT}  VENDOR_DRAFT=${aggregates.reviewQueue.byKind.VENDOR_DRAFT}  DEDUPE_CANDIDATE=${aggregates.reviewQueue.byKind.DEDUPE_CANDIDATE}`,
    '',
  ]
  console.log(lines.join('\n'))

  if (breaches.length === 0) {
    console.log('✓ all thresholds within limits')
  } else {
    console.log('⚠ threshold breaches:')
    for (const b of breaches) {
      console.log(
        `  - ${b.name}: observed ${b.observed} > limit ${b.limit}\n    ${b.hint}`,
      )
    }
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('ingestion metrics failed:', err)
  process.exit(1)
})
