import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import {
  handleSendcloudWebhook,
  verifySendcloudSignature,
} from '@/domains/shipping/webhooks/sendcloud'
import { sendcloudWebhookPayloadSchema } from '@/domains/shipping/providers/sendcloud/webhook-schemas'
import { ensureShippingProvidersRegistered } from '@/domains/shipping/providers'
import { db } from '@/lib/db'
import { getServerEnv } from '@/lib/env'
import { logger } from '@/lib/logger'

/**
 * Sendcloud parcel-status webhook.
 *
 * Expects header `Sendcloud-Signature` with an HMAC-SHA256 hex digest
 * of the raw body using SENDCLOUD_WEBHOOK_SECRET. The signature is
 * verified before any database write to prevent spoofed events.
 *
 * Reliability contract (#568):
 *   - invalid_signature → 401, NO dead-letter (we cannot trust anything
 *     unsigned, and recording would DoS the DLQ).
 *   - invalid_json / malformed payload → 400 + dead-letter with the raw
 *     body hash so an operator can hand-replay after fixing the parser.
 *   - unknown_parcel → 200 + dead-letter (not a retryable Sendcloud
 *     error; we just don't know about that parcel yet).
 *   - unknown_status → 200 + dead-letter (provider-side contract drift;
 *     the mapper needs updating before we can act on it).
 *   - processing_error → 500 + dead-letter (Sendcloud WILL retry,
 *     which is what we want — unlike the previous 200-swallow that
 *     lost the event silently).
 */
async function recordSendcloudDeadLetter(reason: string, ctx: {
  providerRef?: string | null
  eventType?: string
  payload?: unknown
  payloadHash?: string
}) {
  try {
    await db.webhookDeadLetter.create({
      data: {
        provider: 'sendcloud',
        eventType: ctx.eventType ?? 'sendcloud.webhook',
        providerRef: ctx.providerRef ?? null,
        reason,
        payload:
          typeof ctx.payload === 'object' && ctx.payload !== null
            ? (ctx.payload as Parameters<typeof db.webhookDeadLetter.create>[0]['data']['payload'])
            : ctx.payloadHash
              ? { payloadHash: ctx.payloadHash }
              : undefined,
      },
    })
  } catch (err) {
    logger.error('sendcloud.webhook.dead_letter_failed', { reason, err })
  }
}

export async function POST(req: NextRequest) {
  ensureShippingProvidersRegistered()

  const secret = getServerEnv().sendcloudWebhookSecret
  if (!secret) {
    logger.error('sendcloud.webhook.missing_secret', { reason: 'SENDCLOUD_WEBHOOK_SECRET not configured' })
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const rawBody = await req.text()
  const signature = req.headers.get('sendcloud-signature')

  if (!verifySendcloudSignature(rawBody, signature, secret)) {
    logger.warn('sendcloud.webhook.invalid_signature', {})
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  const payloadHash = createHash('sha256').update(rawBody).digest('hex')

  let rawJson: unknown
  try {
    rawJson = JSON.parse(rawBody)
  } catch {
    await recordSendcloudDeadLetter('invalid_json', {
      eventType: 'sendcloud.webhook.invalid_json',
      payloadHash,
    })
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsedPayload = sendcloudWebhookPayloadSchema.safeParse(rawJson)
  if (!parsedPayload.success) {
    logger.error('sendcloud.webhook.invalid_payload', {
      issues: parsedPayload.error.issues,
    })
    await recordSendcloudDeadLetter('invalid_payload', {
      eventType: 'sendcloud.webhook.invalid_payload',
      payloadHash,
    })
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }
  const payload = parsedPayload.data

  const providerRef = payload.parcel ? String(payload.parcel.id) : null
  const eventType = `sendcloud.${payload.action ?? 'parcel_status_changed'}`

  try {
    // #1335: payloadHash is the deterministic eventId. Identical bodies
    // (Sendcloud retries on transient failure, replay tools, etc.)
    // collapse to the same WebhookDelivery row.
    const result = await handleSendcloudWebhook(payload, { eventId: payloadHash })
    if (result.reason === 'duplicate') {
      // True idempotent replay: no DLQ row, no warning. We already
      // processed this exact payload once.
      return NextResponse.json({ ok: true, skipped: 'duplicate' })
    }
    if (!result.handled) {
      await recordSendcloudDeadLetter(result.reason ?? 'unhandled', {
        providerRef,
        eventType,
        payload,
      })
      // not-handled is NOT a Sendcloud retry signal — the shipment is
      // genuinely missing or the status unknown. Return 200 and let
      // the operator replay from the DLQ once the root cause is fixed.
      return NextResponse.json({ ok: false, reason: result.reason }, { status: 200 })
    }
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    logger.error('sendcloud.webhook.processing_error', { providerRef, eventType, err })
    await recordSendcloudDeadLetter('processing_error', {
      providerRef,
      eventType,
      payload,
    })
    // Non-200 so Sendcloud retries. Previous behaviour silently
    // swallowed the event — that's the exact failure mode #568 exists
    // to fix.
    return NextResponse.json({ ok: false, error: 'processing_error' }, { status: 500 })
  }
}
