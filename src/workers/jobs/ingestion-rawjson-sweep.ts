import { db } from '@/lib/db'
import {
  resolveRetentionPolicy,
  runTelegramRawJsonSweep,
  type RawJsonSweepDb,
} from '@/domains/ingestion'

/**
 * Worker adapter for the raw Telegram payload retention sweep.
 *
 * This stays as a separate job from the operational sweeper so the
 * dry-run / retention windows can evolve independently without
 * touching the job-audit cleanup semantics.
 */

export async function runIngestionRawJsonSweep(): Promise<void> {
  const policy = resolveRetentionPolicy()
  await runTelegramRawJsonSweep({
    db: db as unknown as RawJsonSweepDb,
    policy,
    now: () => new Date(),
  })
}
