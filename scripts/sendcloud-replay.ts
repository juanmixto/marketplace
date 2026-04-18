#!/usr/bin/env node
/**
 * Replays a Sendcloud webhook event recorded in `WebhookDeadLetter`
 * (#568). Useful after fixing a root cause that left a row in the DLQ
 * — unknown_parcel (shipment registered late), unknown_status (mapper
 * updated), or processing_error (transient DB issue resolved).
 *
 * Usage:
 *   npm run sendcloud:replay -- --id <dlq-row-id>
 *   npm run sendcloud:replay -- --id <dlq-row-id> --dry-run
 *
 * Behaviour:
 *   - Loads the DLQ row by id.
 *   - Refuses to replay if `provider != 'sendcloud'` or `resolvedAt`
 *     is already set (explicit re-open via `dlq:resolve --reopen`
 *     would be a separate flow).
 *   - Re-runs `handleSendcloudWebhook(payload)`.
 *   - On success: marks the row `resolvedAt = now()`,
 *     `resolvedBy = <CLI actor>`.
 *   - On failure: leaves the row open and prints the new error so
 *     the operator can iterate.
 */

import { db } from '@/lib/db'
import { handleSendcloudWebhook, type SendcloudWebhookPayload } from '@/domains/shipping/webhooks/sendcloud'
import { ensureShippingProvidersRegistered } from '@/domains/shipping/providers'
import { logger } from '@/lib/logger'

function parseFlag(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return null
  return process.argv[idx + 1] ?? null
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main() {
  const id = parseFlag('id')
  if (!id) {
    process.stderr.write('sendcloud-replay: --id <dlq-row-id> is required\n')
    process.exit(1)
  }
  const dryRun = hasFlag('dry-run')
  const actor = parseFlag('by') ?? process.env.USER ?? 'cli'

  const row = await db.webhookDeadLetter.findUnique({ where: { id } })
  if (!row) {
    process.stderr.write(`sendcloud-replay: no DLQ row with id=${id}\n`)
    process.exit(1)
  }
  if (row.provider !== 'sendcloud') {
    process.stderr.write(
      `sendcloud-replay: row ${id} is provider='${row.provider}', refusing. Use the matching provider's replay script.\n`,
    )
    process.exit(1)
  }
  if (row.resolvedAt) {
    process.stderr.write(
      `sendcloud-replay: row ${id} is already resolved at ${row.resolvedAt.toISOString()}. Re-open it first if you really mean to replay.\n`,
    )
    process.exit(1)
  }
  if (!row.payload || typeof row.payload !== 'object') {
    process.stderr.write(
      `sendcloud-replay: row ${id} has no full payload snapshot (likely invalid_json with only a hash). Replay requires a payload; fix the upstream parser + wait for Sendcloud to retry instead.\n`,
    )
    process.exit(1)
  }

  process.stdout.write(`sendcloud-replay: row ${id} (${row.eventType}) reason=${row.reason}\n`)

  if (dryRun) {
    process.stdout.write('[dry-run] would invoke handleSendcloudWebhook; skipping\n')
    return
  }

  ensureShippingProvidersRegistered()
  const result = await handleSendcloudWebhook(row.payload as unknown as SendcloudWebhookPayload)

  if (!result.handled) {
    logger.error('sendcloud.replay.not_handled', { id, reason: result.reason })
    process.stderr.write(
      `sendcloud-replay: handler returned not-handled (reason=${result.reason}). DLQ row untouched.\n`,
    )
    process.exit(1)
  }

  await db.webhookDeadLetter.update({
    where: { id },
    data: { resolvedAt: new Date(), resolvedBy: actor },
  })
  logger.info('sendcloud.replay.resolved', { id, actor })
  process.stdout.write(`sendcloud-replay: row ${id} resolved by ${actor}\n`)
}

main().catch(err => {
  logger.error('sendcloud.replay.fatal', { error: err })
  process.stderr.write(`sendcloud-replay fatal: ${err?.message ?? err}\n`)
  process.exit(1)
})
