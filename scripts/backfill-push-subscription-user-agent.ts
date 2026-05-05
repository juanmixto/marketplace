#!/usr/bin/env node
/**
 * One-shot backfill for PushSubscription.userAgent.
 *
 * Existing rows may still contain raw browser fingerprints from before
 * the hash-at-write change. This script rewrites only rows whose value
 * does not already look like a sha256 hex digest.
 *
 * Usage:
 *   npm run push:backfill-user-agent              # dry-run
 *   PUSH_USER_AGENT_BACKFILL_DRY_RUN=false npm run push:backfill-user-agent
 */

import { db } from '@/lib/db'
import { hashPushUserAgent, isHashedPushUserAgent } from '@/domains/push-notifications/user-agent'

function parseDryRunFlag(): boolean {
  const raw = process.env.PUSH_USER_AGENT_BACKFILL_DRY_RUN
  if (raw === undefined) return true
  return raw !== 'false'
}

async function main() {
  const dryRun = parseDryRunFlag()
  const batchSize = 500
  let scanned = 0
  let updated = 0
  let cursor: string | undefined

  while (true) {
    const rows = await db.pushSubscription.findMany({
      select: { id: true, userAgent: true },
      take: batchSize,
      orderBy: { id: 'asc' },
      where: {
        userAgent: { not: null },
      },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    if (rows.length === 0) break
    scanned += rows.length
    cursor = rows[rows.length - 1]!.id

    const candidates = rows.filter(row => row.userAgent && !isHashedPushUserAgent(row.userAgent))
    if (candidates.length > 0) {
      if (dryRun) {
        process.stdout.write(
          `[dry-run] would hash ${candidates.length} push subscription userAgent values\n`,
        )
      } else {
        for (const row of candidates) {
          await db.pushSubscription.update({
            where: { id: row.id },
            data: { userAgent: hashPushUserAgent(row.userAgent) },
          })
        }
      }
      updated += candidates.length
    }

    if (rows.length < batchSize) break
  }

  process.stdout.write(
    JSON.stringify({ dryRun, scanned, updated }, null, 2) + '\n',
  )
}

main().catch(err => {
  process.stderr.write(`push subscription user-agent backfill failed: ${err?.message ?? err}\n`)
  process.exit(1)
})
