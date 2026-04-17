/**
 * Marks a WebhookDeadLetter row as resolved after an operator manually
 * replayed / reconciled it.
 *
 * Usage:
 *   npx tsx scripts/dlq-mark-resolved.ts <rowId> [--by "jane@example.com"]
 *
 * Does NOT replay the event — use the Stripe dashboard or a future
 * replay script for that. This only stamps the audit trail so the row
 * drops out of `npx tsx scripts/dlq-list.ts`.
 */
import { db } from '../src/lib/db'
import { markDlqResolved } from '../src/domains/payments/webhook-dlq-ops'

function parseFlag(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return null
  return process.argv[idx + 1] ?? null
}

async function main() {
  const rowId = process.argv[2]
  if (!rowId || rowId.startsWith('--')) {
    console.error('Usage: npx tsx scripts/dlq-mark-resolved.ts <rowId> [--by "user"]')
    process.exit(1)
  }
  const resolvedBy = parseFlag('by') ?? process.env.USER ?? 'operator'

  const existing = await db.webhookDeadLetter.findUnique({ where: { id: rowId } })
  if (!existing) {
    console.error(`DLQ row ${rowId} not found.`)
    process.exit(1)
  }
  if (existing.resolvedAt) {
    console.log(
      `DLQ row ${rowId} was already resolved at ${existing.resolvedAt.toISOString()} by ${existing.resolvedBy ?? '?'}.`
    )
    return
  }

  await markDlqResolved(db, rowId, resolvedBy)
  console.log(`✓ DLQ row ${rowId} marked resolved by ${resolvedBy}.`)
}

main()
  .catch((err) => {
    console.error('[dlq-mark-resolved] error', err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
