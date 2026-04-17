/**
 * Operational helpers for the WebhookDeadLetter table: list, count, and
 * mark rows as resolved.
 *
 * The CLI scripts (`scripts/dlq-list.ts`, `scripts/dlq-mark-resolved.ts`)
 * delegate to these so the same logic can be driven from a cron job /
 * admin UI in the future without shelling out.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDelegate = { findMany: (args?: any) => Promise<any>; count: (args?: any) => Promise<number>; update: (args: any) => Promise<any> }
export type WebhookDlqOpsClient = { webhookDeadLetter: AnyDelegate }

export interface DlqListOptions {
  limit?: number
  includeResolved?: boolean
  provider?: string
  eventType?: string
}

export interface DlqRow {
  id: string
  provider: string
  eventId: string | null
  eventType: string
  providerRef: string | null
  reason: string
  resolvedAt: Date | null
  resolvedBy: string | null
  createdAt: Date
}

/**
 * Returns recent DLQ rows ordered by createdAt DESC. By default filters
 * out resolved rows so operators see only the pending queue.
 */
export async function listDlqRows(
  client: WebhookDlqOpsClient,
  opts: DlqListOptions = {}
): Promise<DlqRow[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 500))
  const where: Record<string, unknown> = {}
  if (!opts.includeResolved) where.resolvedAt = null
  if (opts.provider) where.provider = opts.provider
  if (opts.eventType) where.eventType = opts.eventType

  const rows = await client.webhookDeadLetter.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      provider: true,
      eventId: true,
      eventType: true,
      providerRef: true,
      reason: true,
      resolvedAt: true,
      resolvedBy: true,
      createdAt: true,
    },
  })
  return rows as DlqRow[]
}

/**
 * Counts DLQ rows in a rolling time window. Returns `{ total, bySince }`
 * so the caller can page a dashboard tile ("12 pending, 3 in last 24h").
 */
export async function countDlqRows(
  client: WebhookDlqOpsClient,
  opts: { sinceMs?: number; includeResolved?: boolean } = {}
): Promise<{ total: number; recent: number; windowMs: number }> {
  const windowMs = opts.sinceMs ?? 24 * 60 * 60 * 1000
  const since = new Date(Date.now() - windowMs)

  const baseWhere: Record<string, unknown> = {}
  if (!opts.includeResolved) baseWhere.resolvedAt = null

  const [total, recent] = await Promise.all([
    client.webhookDeadLetter.count({ where: baseWhere }),
    client.webhookDeadLetter.count({
      where: { ...baseWhere, createdAt: { gte: since } },
    }),
  ])

  return { total, recent, windowMs }
}

/**
 * Marks a DLQ row as resolved. Does not replay the event — callers that
 * replay successfully should then call this to stamp who handled it.
 */
export async function markDlqResolved(
  client: WebhookDlqOpsClient,
  rowId: string,
  resolvedBy: string
): Promise<void> {
  await client.webhookDeadLetter.update({
    where: { id: rowId },
    data: {
      resolvedAt: new Date(),
      resolvedBy,
    },
  })
}

/**
 * Threshold helper for an oncall alert: returns `true` when the rolling
 * window holds more than `threshold` pending rows. Leaves the actual
 * delivery (Slack / PagerDuty / email) to the cron script so this module
 * stays pure.
 */
export function shouldAlertDlq(
  count: { total: number; recent: number },
  threshold = { total: 10, recent: 3 }
): boolean {
  return count.total >= threshold.total || count.recent >= threshold.recent
}
