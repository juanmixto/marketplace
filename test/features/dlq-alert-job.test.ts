import test from 'node:test'
import assert from 'node:assert/strict'
import { runDlqAlertJob, DLQ_ALERT_CRON } from '@/workers/jobs/dlq-alert'
import type { Logger } from '@/lib/logger'
import type { WebhookDlqOpsClient } from '@/domains/payments/webhook-dlq-ops'

/**
 * Behavioural tests for the recurring DLQ alert job (#1213).
 *
 * The job is small but the contract matters: when `shouldAlertDlq()`
 * trips, we must emit `dlq.alert.fired` at error level (so it
 * auto-mirrors to Sentry); when it doesn't, we must emit
 * `dlq.alert.skipped` at info level (so an operator can confirm the
 * cron is firing). Renaming either scope silently breaks alerting /
 * dashboards.
 */

interface CapturedLog {
  level: 'info' | 'warn' | 'error' | 'debug'
  scope: string
  context?: Record<string, unknown>
}

function resolveContext(
  msgOrContext: string | Record<string, unknown> | undefined,
  context: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (typeof msgOrContext === 'object' && msgOrContext !== null) return msgOrContext
  return context
}

function buildLogger(captured: CapturedLog[]): Logger {
  return {
    debug: (scope, msgOrContext, context) =>
      captured.push({
        level: 'debug',
        scope,
        context: resolveContext(msgOrContext, context as Record<string, unknown> | undefined),
      }),
    info: (scope, msgOrContext, context) =>
      captured.push({
        level: 'info',
        scope,
        context: resolveContext(msgOrContext, context as Record<string, unknown> | undefined),
      }),
    warn: (scope, msgOrContext, context) =>
      captured.push({
        level: 'warn',
        scope,
        context: resolveContext(msgOrContext, context as Record<string, unknown> | undefined),
      }),
    error: (scope, msgOrContext, context) =>
      captured.push({
        level: 'error',
        scope,
        context: resolveContext(msgOrContext, context as Record<string, unknown> | undefined),
      }),
  }
}

function buildClient(rows: Array<{ resolvedAt: Date | null; createdAt: Date }>): WebhookDlqOpsClient {
  return {
    webhookDeadLetter: {
      findMany: async () => [],
      update: async () => ({}),
      async count(args: { where?: Record<string, unknown> } = {}) {
        const where = args.where ?? {}
        let filtered = rows
        if (where.resolvedAt === null) {
          filtered = filtered.filter((r) => r.resolvedAt === null)
        }
        const since = (where.createdAt as { gte?: Date } | undefined)?.gte
        if (since) {
          filtered = filtered.filter((r) => r.createdAt.getTime() >= since.getTime())
        }
        return filtered.length
      },
    },
  }
}

test('runDlqAlertJob emits dlq.alert.skipped at info level when below threshold', async () => {
  const captured: CapturedLog[] = []
  const client = buildClient([{ resolvedAt: null, createdAt: new Date() }])
  await runDlqAlertJob({ client, logger: buildLogger(captured) })

  const skipped = captured.find((c) => c.scope === 'dlq.alert.skipped')
  assert.ok(skipped, 'expected dlq.alert.skipped to be emitted')
  assert.equal(skipped!.level, 'info')
  assert.equal(skipped!.context?.total, 1)
  const fired = captured.find((c) => c.scope === 'dlq.alert.fired')
  assert.equal(fired, undefined)
})

test('runDlqAlertJob emits dlq.alert.fired at error level when total threshold is breached', async () => {
  const captured: CapturedLog[] = []
  const client = buildClient(
    Array.from({ length: 12 }, () => ({
      resolvedAt: null,
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // outside 24h window
    })),
  )
  await runDlqAlertJob({ client, logger: buildLogger(captured) })

  const fired = captured.find((c) => c.scope === 'dlq.alert.fired')
  assert.ok(fired, 'expected dlq.alert.fired when total >= 10')
  assert.equal(fired!.level, 'error')
  assert.equal(fired!.context?.total, 12)
  assert.equal(fired!.context?.recent, 0)
  assert.match(
    String(fired!.context?.runbook),
    /payment-incidents/,
    'fired event must point to the payment-incidents runbook',
  )
})

test('runDlqAlertJob fires when the recent (24h) threshold is breached even if total is small', async () => {
  const captured: CapturedLog[] = []
  const now = Date.now()
  const client = buildClient(
    Array.from({ length: 4 }, (_, i) => ({
      resolvedAt: null,
      createdAt: new Date(now - i * 60 * 60 * 1000),
    })),
  )
  await runDlqAlertJob({ client, logger: buildLogger(captured) })

  const fired = captured.find((c) => c.scope === 'dlq.alert.fired')
  assert.ok(fired, 'expected dlq.alert.fired when recent >= 3')
  assert.equal(fired!.context?.recent, 4)
})

test('DLQ_ALERT_CRON is every-15-minutes (operational contract)', () => {
  assert.equal(
    DLQ_ALERT_CRON,
    '*/15 * * * *',
    'Changing the cadence requires updating docs/runbooks/payment-incidents.md and the alert thresholds.',
  )
})
