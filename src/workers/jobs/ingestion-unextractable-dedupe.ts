import type PgBoss from 'pg-boss'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { generateCorrelationId } from '@/lib/correlation'
import {
  scanUnextractableDedupe,
  type UnextractableScannerDb,
} from '@/domains/ingestion'

/**
 * Worker adapter for `ingestion.processing.unextractable-dedupe`.
 *
 * Runs after the drafts builder persists a row with status
 * UNEXTRACTABLE (currently only for classification=PRODUCT_NO_PRICE
 * per iter-2 scope). Thin wrapper over the pure scanner so tests can
 * exercise dedupe logic without a worker.
 */

export interface UnextractableDedupeJobData {
  extractionId: string
  correlationId?: string
}

export async function runUnextractableDedupeJob(
  job: PgBoss.Job<UnextractableDedupeJobData>,
): Promise<void> {
  const correlationId = job.data.correlationId ?? generateCorrelationId()
  const result = await scanUnextractableDedupe(
    { extractionId: job.data.extractionId, correlationId },
    {
      db: db as unknown as UnextractableScannerDb,
      now: () => new Date(),
    },
  )
  logger.info('ingestion.processing.unextractable-dedupe.metrics', {
    extractionId: job.data.extractionId,
    correlationId,
    status: result.status,
    candidatesCreated: result.candidatesCreated,
    autoMerged: result.autoMerged,
    enqueuedForReview: result.enqueuedForReview,
  })
}
