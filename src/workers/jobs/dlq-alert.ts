import { db } from '@/lib/db'
import { logger as defaultLogger, type Logger } from '@/lib/logger'
import {
  countDlqRows,
  shouldAlertDlq,
  type WebhookDlqOpsClient,
} from '@/domains/payments/webhook-dlq-ops'

export const DLQ_ALERT_JOB = 'webhook.dlq.alert'
export const DLQ_ALERT_CRON = '*/15 * * * *' // every 15 minutes

interface DlqAlertDeps {
  client?: WebhookDlqOpsClient
  logger?: Logger
}

/**
 * Recurring DLQ alerting tick (#1213).
 *
 * Until now `shouldAlertDlq()` was a helper that someone had to call
 * by running `npm run dlq:list` — fine for a manual cadence, useless
 * in production at 03:00 when nobody is watching the terminal. This
 * job runs every 15 minutes, applies the same threshold helper, and
 * emits a `dlq.alert.fired` error log when it trips.
 *
 * Dedup is delegated to Sentry: structured-log errors with the same
 * scope group into a single issue, and the existing "first seen on
 * production with severity ≥ error" alert rule pages oncall once per
 * window — not every 15 minutes. We deliberately do NOT carry a
 * dedup table; that just adds new failure modes (stale lock rows,
 * etc.) for no operational gain.
 *
 * Skipped state when the threshold is NOT breached is logged at info
 * level so an operator can confirm "the cron IS firing, the queue is
 * empty" without grepping.
 *
 * Dependencies are injectable for testing; production callers omit
 * them and the defaults wire to the real Prisma client and logger.
 */
export async function runDlqAlertJob(deps: DlqAlertDeps = {}): Promise<void> {
  const client = deps.client ?? (db as unknown as WebhookDlqOpsClient)
  const log = deps.logger ?? defaultLogger

  const counts = await countDlqRows(client, {
    sinceMs: 24 * 60 * 60 * 1000,
    includeResolved: false,
  })

  const trip = shouldAlertDlq(counts)
  if (!trip) {
    log.info('dlq.alert.skipped', {
      total: counts.total,
      recent: counts.recent,
      windowMs: counts.windowMs,
    })
    return
  }

  // logger.error auto-mirrors to Sentry (see src/lib/logger.ts).
  // The Sentry issue groups by message, so 96 fires/day collapse into
  // one issue; the "first seen" alert pages oncall once per window
  // until the queue drains.
  log.error('dlq.alert.fired', {
    total: counts.total,
    recent: counts.recent,
    windowMs: counts.windowMs,
    runbook: 'docs/runbooks/payment-incidents.md#dlq',
  })
}
