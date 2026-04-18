import { NextRequest, NextResponse } from 'next/server'
import {
  handleSendcloudWebhook,
  verifySendcloudSignature,
  type SendcloudWebhookPayload,
} from '@/domains/shipping/webhooks/sendcloud'
import { ensureShippingProvidersRegistered } from '@/domains/shipping/providers'
import { getServerEnv } from '@/lib/env'
import { logger } from '@/lib/logger'

/**
 * Sendcloud parcel-status webhook.
 *
 * Expects header `Sendcloud-Signature` with an HMAC-SHA256 hex digest
 * of the raw body using SENDCLOUD_WEBHOOK_SECRET. The signature is
 * verified before any database work to prevent spoofed events.
 */
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

  let payload: SendcloudWebhookPayload
  try {
    payload = JSON.parse(rawBody) as SendcloudWebhookPayload
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  try {
    const result = await handleSendcloudWebhook(payload)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    logger.error('sendcloud.webhook.processing_error', { err })
    // Return 200 so Sendcloud doesn't retry indefinitely; the
    // ShipmentEvent is already written if we got far enough, and
    // admin can replay manually if needed.
    return NextResponse.json({ ok: false, error: 'processing_error' }, { status: 200 })
  }
}
