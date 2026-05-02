/**
 * One-shot backfill: enqueue a `VENDOR_DRAFT` review queue item for
 * every existing `IngestionVendorDraft` that does not yet have one.
 *
 * Necessary because the vendor-lead surfacing on the admin queue
 * shipped after Phase 2 had already produced hundreds of vendor
 * drafts (one per `PRODUCT`-classified message). Without this
 * backfill those leads would only become visible by re-running
 * the entire processor over every raw message.
 *
 * Idempotent: the `(kind, targetId)` unique constraint on
 * `IngestionReviewQueueItem` makes re-runs a no-op.
 *
 * Usage:
 *   npx tsx scripts/ingestion-backfill-vendor-leads.ts [--dry]
 */
import { db } from '@/lib/db'

interface Args {
  dryRun: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  return { dryRun: argv.includes('--dry') || argv.includes('--dry-run') }
}

async function main() {
  const args = parseArgs()
  console.log('[backfill-vendor-leads] dry=%s', args.dryRun)

  // Vendor drafts that have no matching review queue item yet.
  // LEFT JOIN + IS NULL is the canonical anti-join; cheaper than
  // NOT IN at scale and works when the right side is empty.
  const rows = await db.$queryRawUnsafe<{ id: string }[]>(`
    SELECT vd.id
    FROM "IngestionVendorDraft" vd
    LEFT JOIN "IngestionReviewQueueItem" q
      ON q.kind = 'VENDOR_DRAFT' AND q."targetId" = vd.id
    WHERE q.id IS NULL
  `)

  console.log(`[backfill-vendor-leads] candidates: ${rows.length}`)

  if (rows.length === 0) {
    console.log('[backfill-vendor-leads] nothing to do')
    await db.$disconnect()
    return
  }

  if (args.dryRun) {
    console.log(`[backfill-vendor-leads] would enqueue ${rows.length} items`)
    await db.$disconnect()
    return
  }

  // Insert in chunks so a single transaction never gets too long.
  const chunkSize = 500
  let enqueued = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    await db.$transaction(
      chunk.map((r) =>
        db.ingestionReviewQueueItem.upsert({
          where: { kind_targetId: { kind: 'VENDOR_DRAFT', targetId: r.id } },
          create: {
            kind: 'VENDOR_DRAFT',
            targetId: r.id,
            priority: 10,
          },
          update: {},
        }),
      ),
    )
    enqueued += chunk.length
    console.log(`[backfill-vendor-leads] enqueued ${enqueued}/${rows.length}`)
  }

  console.log(`[backfill-vendor-leads] done. enqueued=${enqueued}`)
  await db.$disconnect()
}

main().catch((err) => {
  console.error('[backfill-vendor-leads] failed:', err)
  process.exit(1)
})
