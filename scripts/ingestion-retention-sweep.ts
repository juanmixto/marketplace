/**
 * Manual retention sweep. Safe to run at any time; the sweeper is
 * idempotent and capped. Use when a nightly run failed or when a
 * policy change demands an immediate catch-up.
 *
 *   npm run ingestion:sweep
 */

import { runIngestionRetentionSweep } from '@/workers/jobs/ingestion-retention-sweep'

async function main() {
  await runIngestionRetentionSweep()
  console.log('ingestion retention sweep: done')
  process.exit(0)
}

main().catch((err) => {
  console.error('ingestion retention sweep: failed', err)
  process.exit(1)
})
