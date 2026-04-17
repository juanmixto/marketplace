/**
 * Lists recent WebhookDeadLetter rows.
 *
 * Usage:
 *   npx tsx scripts/dlq-list.ts                 # last 50 unresolved rows, table
 *   npx tsx scripts/dlq-list.ts --json          # JSON output (scriptable)
 *   npx tsx scripts/dlq-list.ts --limit 100     # custom page size
 *   npx tsx scripts/dlq-list.ts --include-resolved
 *   npx tsx scripts/dlq-list.ts --event-type invoice.paid
 *   npx tsx scripts/dlq-list.ts --provider stripe
 *
 * Run from a host that has DATABASE_URL set (production or a staging copy).
 * The output is safe to paste into an incident: `reason`, `eventType`,
 * `providerRef` are the fields oncall needs to start the runbook.
 */
import { db } from '../src/lib/db'
import { listDlqRows, countDlqRows, shouldAlertDlq } from '../src/domains/payments/webhook-dlq-ops'

function parseFlag(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return null
  return process.argv[idx + 1] ?? null
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main() {
  const limit = Number(parseFlag('limit') ?? '50')
  const eventType = parseFlag('event-type') ?? undefined
  const provider = parseFlag('provider') ?? undefined
  const includeResolved = hasFlag('include-resolved')
  const asJson = hasFlag('json')

  const rows = await listDlqRows(db, {
    limit,
    eventType,
    provider,
    includeResolved,
  })
  const counts = await countDlqRows(db, { includeResolved: false })
  const alerting = shouldAlertDlq(counts)

  if (asJson) {
    console.log(JSON.stringify({ counts, alerting, rows }, null, 2))
    return
  }

  console.log(
    `\nDLQ summary: ${counts.total} total pending  ·  ${counts.recent} in last ${Math.round(
      counts.windowMs / 3_600_000
    )}h  ·  alert=${alerting ? 'YES' : 'no'}\n`
  )

  if (rows.length === 0) {
    console.log('No DLQ rows match the filter. 🎉')
    return
  }

  for (const row of rows) {
    const age = Math.round((Date.now() - new Date(row.createdAt).getTime()) / 60_000)
    const status = row.resolvedAt ? `resolved by ${row.resolvedBy ?? '?'}` : 'PENDING'
    console.log(
      [
        row.id,
        row.eventType.padEnd(36),
        (row.providerRef ?? '-').padEnd(32),
        `${age}m ago`.padEnd(14),
        status.padEnd(28),
        row.reason,
      ].join('  ')
    )
  }
  console.log(`\nShowing ${rows.length} of up to ${limit}. Use --limit to widen.\n`)
}

main()
  .catch((err) => {
    console.error('[dlq-list] error', err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
