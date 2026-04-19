#!/usr/bin/env node
/**
 * Lists review reports pending moderation (#571).
 *
 * Usage:
 *   npm run reports:reviews                 # last 50 unresolved, table
 *   npm run reports:reviews -- --json       # JSON output
 *   npm run reports:reviews -- --include-resolved
 *   npm run reports:reviews -- --limit 200
 *
 * Prints the report row, the reporter, and the first 120 chars of
 * the review body / vendor response so moderators can triage
 * straight from the CLI without a UI.
 */

import { db } from '@/lib/db'

function parseFlag(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return null
  return process.argv[idx + 1] ?? null
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main() {
  const limit = Math.min(500, Math.max(1, Number(parseFlag('limit') ?? '50')))
  const includeResolved = hasFlag('include-resolved')
  const asJson = hasFlag('json')

  const rows = await db.reviewReport.findMany({
    where: includeResolved ? {} : { resolvedAt: null },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      reporter: { select: { id: true, email: true, role: true } },
      review: {
        select: {
          id: true,
          productId: true,
          vendorId: true,
          customerId: true,
          rating: true,
          body: true,
          vendorResponse: true,
        },
      },
    },
  })

  if (asJson) {
    process.stdout.write(JSON.stringify(rows, null, 2) + '\n')
    return
  }

  if (rows.length === 0) {
    process.stdout.write('No review reports pending.\n')
    return
  }

  for (const r of rows) {
    const snippet = (r.target === 'VENDOR_RESPONSE' ? r.review.vendorResponse : r.review.body) ?? ''
    const short = snippet.replace(/\s+/g, ' ').slice(0, 120)
    process.stdout.write(
      `${r.id}  ${r.createdAt.toISOString().slice(0, 19)}  ${r.reason.padEnd(9)}  ${r.target.padEnd(15)}  reporter=${r.reporter.email}  review=${r.review.id}\n`,
    )
    process.stdout.write(`    "${short}"\n`)
  }
}

main().catch(err => {
  process.stderr.write(`reports:reviews fatal: ${err?.message ?? err}\n`)
  process.exit(1)
})
