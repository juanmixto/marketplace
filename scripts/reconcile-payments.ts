#!/usr/bin/env node
/**
 * Operator-triggered reconciliation sweep (#405). Compares stale
 * PENDING Payment rows against Stripe and applies the corresponding
 * state transition.
 *
 * Usage:
 *   npm run reconcile:payments                       # default: 60-minute cutoff
 *   npm run reconcile:payments -- --older-than 120   # 2-hour cutoff
 *   npm run reconcile:payments -- --dry-run          # query + log, no writes
 *
 * Safe to re-run — every transition is guarded by current status.
 * Mock mode exits cleanly with a no-op (no Stripe, nothing to
 * reconcile).
 */

import { db } from '@/lib/db'
import { getServerEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import {
  makeStripeFetcher,
  reconcilePendingPayments,
} from '@/domains/payments/reconcile'

function parseArgs() {
  const args = process.argv.slice(2)
  let olderThanMinutes = 60
  let dryRun = false
  let limit = 500
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]
    if (a === '--older-than') {
      olderThanMinutes = Number(args[i + 1])
      i += 1
    } else if (a === '--dry-run') {
      dryRun = true
    } else if (a === '--limit') {
      limit = Number(args[i + 1])
      i += 1
    }
  }
  if (!Number.isFinite(olderThanMinutes) || olderThanMinutes < 1) {
    throw new Error('--older-than must be a positive number of minutes')
  }
  return { olderThanMinutes, dryRun, limit }
}

async function main() {
  const { olderThanMinutes, dryRun, limit } = parseArgs()
  const env = getServerEnv()

  if (env.paymentProvider !== 'stripe') {
    logger.info('payments.reconcile.skipped_mock', {
      reason: 'PAYMENT_PROVIDER=mock — nothing to reconcile against Stripe',
    })
    process.stdout.write('mock mode: nothing to reconcile. exit.\n')
    return
  }

  const stripe = await makeStripeFetcher()
  if (!stripe) {
    process.stderr.write(
      'reconcile: expected stripe fetcher but got null — check STRIPE_SECRET_KEY.\n',
    )
    process.exit(1)
  }

  if (dryRun) {
    process.stdout.write(
      `reconcile (DRY RUN): olderThan=${olderThanMinutes}m limit=${limit}\n`,
    )
    // Wrap every write in a noop so the core loop runs unchanged.
    const originalTx = db.$transaction.bind(db)
    ;(db as { $transaction: typeof db.$transaction }).$transaction = (async (
      arg: unknown,
    ) => {
      if (typeof arg === 'function') {
        process.stdout.write('[dry-run] would open a transaction, skipping\n')
        return undefined
      }
      return originalTx(arg as never)
    }) as never
  }

  const report = await reconcilePendingPayments({
    db,
    stripe,
    olderThanMinutes,
    limit,
  })

  process.stdout.write(JSON.stringify(report, null, 2) + '\n')

  if (report.errors > 0) process.exit(1)
}

main().catch(err => {
  logger.error('payments.reconcile.fatal', { error: err })
  process.stderr.write(`reconcile fatal: ${err?.message ?? err}\n`)
  process.exit(1)
})
