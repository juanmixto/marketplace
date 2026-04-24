import type PgBoss from 'pg-boss'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import {
  dedupeMetricsFrom,
  scanDedupe,
  type DedupeScannerDb,
} from '@/domains/ingestion'
import { generateCorrelationId } from '@/lib/correlation'

/**
 * Worker adapter for `ingestion.processing.dedupe-drafts`.
 *
 * Runs after the drafts builder persists a new `ProductDraft`. The
 * handler is a thin wrapper over the pure `scanDedupe`; all rules /
 * persistence / auto-merge logic lives in the domain module so
 * tests can exercise it without a worker.
 */

export interface DedupeJobData {
  productDraftId: string
  correlationId?: string
}

export async function runDedupeJob(
  job: PgBoss.Job<DedupeJobData>,
): Promise<void> {
  const correlationId = job.data.correlationId ?? generateCorrelationId()
  const result = await scanDedupe(
    { productDraftId: job.data.productDraftId, correlationId },
    {
      db: db as unknown as DedupeScannerDb,
      now: () => new Date(),
    },
  )
  const metrics = dedupeMetricsFrom(result)
  logger.info('ingestion.processing.dedupe.metrics', {
    productDraftId: job.data.productDraftId,
    correlationId,
    status: result.status,
    ...metrics,
  })
}
