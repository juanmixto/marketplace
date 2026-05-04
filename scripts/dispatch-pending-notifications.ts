#!/usr/bin/env node
/**
 * Operator-triggered notification outbox sweep (#1171 H-10).
 *
 * Re-emits any `NOTIFICATION_PENDING` OrderEvent that lacks a
 * matching `NOTIFICATION_DELIVERED` sibling. The intent row is
 * written inside the same transaction as the state mutation that
 * triggered the notification, so a process crash between commit and
 * post-commit emit cannot lose the email.
 *
 * Usage:
 *   npm run notify:dispatch-pending                       # default: 10-minute cutoff
 *   npm run notify:dispatch-pending -- --older-than 30    # 30-minute cutoff
 *   npm run notify:dispatch-pending -- --limit 50         # cap reviewed rows
 *
 * Idempotent: re-running is always safe. The sweep filters out PENDING
 * rows that already have a DELIVERED sibling (matched by payloadRef).
 *
 * Mirrors the operator pattern of `reconcile-payments.ts` — not a cron,
 * not a worker. An operator runs it after a deploy or after observing
 * "el cliente pagó pero no recibió email" support tickets.
 */

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { dispatchPendingOutboxNotifications } from '@/domains/notifications/outbox'

function parseArgs() {
  const args = process.argv.slice(2)
  let olderThanMinutes = 10
  let limit = 200
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]
    if (a === '--older-than') {
      olderThanMinutes = Number(args[i + 1])
      i += 1
    } else if (a === '--limit') {
      limit = Number(args[i + 1])
      i += 1
    }
  }
  if (!Number.isFinite(olderThanMinutes) || olderThanMinutes < 1) {
    throw new Error('--older-than must be a positive number of minutes')
  }
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error('--limit must be a positive integer')
  }
  return { olderThanMinutes, limit }
}

async function main() {
  const { olderThanMinutes, limit } = parseArgs()

  const report = await dispatchPendingOutboxNotifications({
    db,
    olderThanMinutes,
    limit,
  })

  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  if (report.errors > 0) process.exit(1)
}

main().catch(err => {
  logger.error('notifications.outbox.fatal', { error: err })
  process.stderr.write(`outbox dispatch fatal: ${err?.message ?? err}\n`)
  process.exit(1)
})
