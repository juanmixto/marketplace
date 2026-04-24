import { db } from '@/lib/db'
import {
  resolveRetentionPolicy,
  runRetentionSweep,
  type SweeperDb,
} from '@/domains/ingestion'

/**
 * Worker adapter: runs the retention sweeper with the real `db` and
 * env-resolved policy. The worker registers this both as an
 * on-demand pg-boss job (admins can trigger it) and as a nightly
 * cron via `boss.schedule`.
 */

export async function runIngestionRetentionSweep(): Promise<void> {
  const policy = resolveRetentionPolicy()
  await runRetentionSweep({
    db: db as unknown as SweeperDb,
    policy,
    now: () => new Date(),
  })
}
