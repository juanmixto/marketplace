/**
 * Manual orphan-blob sweep. Safe to run at any time; the sweeper is
 * idempotent and dry-run by default. Activate real deletes only after
 * verifying `photo.sweep.orphans_found` looks sane in PostHog/logs.
 *
 *   npm run sweep:orphans                       # dry-run
 *   PHOTO_SWEEP_DRY_RUN=false npm run sweep:orphans   # real deletes
 *
 * See docs/runbooks/photo-storage.md for the rollout playbook.
 */

import { runOrphanBlobSweep } from '@/workers/jobs/sweep-orphan-blobs'

async function main() {
  const result = await runOrphanBlobSweep()
  // Print the structured result so a CI/cron container captures it
  // even without the logger sink wired up.
  console.log('photo sweep result:', JSON.stringify(result, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error('photo sweep: failed', err)
  process.exit(1)
})
