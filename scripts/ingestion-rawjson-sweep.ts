/**
 * Manual raw-payload retention sweep for Telegram ingestion messages.
 *
 * Safe to run at any time. Defaults to dry-run mode; set
 * `INGESTION_TELEGRAM_RAWJSON_SWEEP_DRY_RUN=false` to actually null
 * out `rawJson` on the matched rows.
 */

import { runIngestionRawJsonSweep } from '@/workers/jobs/ingestion-rawjson-sweep'

async function main() {
  await runIngestionRawJsonSweep()
  console.log('telegram rawJson sweep: done')
  process.exit(0)
}

main().catch((err) => {
  console.error('telegram rawJson sweep: failed', err)
  process.exit(1)
})
