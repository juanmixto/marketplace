import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getTelegramConfig } from '@/domains/notifications/telegram/config'
import { telegramUpdateSchema } from '@/domains/notifications/telegram/update-schema'
import { handleTelegramUpdate } from '@/domains/notifications/telegram/controller'
import { checkInboundRateLimit } from '@/domains/notifications/telegram/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function secretsMatch(provided: string | null, expected: string): boolean {
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function extractClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp
  return 'unknown'
}

export async function POST(req: Request): Promise<Response> {
  const config = getTelegramConfig()
  if (!config) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const ip = extractClientIp(req)
  if (!checkInboundRateLimit(ip)) {
    console.warn('telegram.webhook.rate_limited', { ip })
    return new NextResponse(null, { status: 200 })
  }

  const url = new URL(req.url)
  const urlSecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('x-telegram-bot-api-secret-token')

  const urlOk = secretsMatch(urlSecret, config.webhookSecret)
  const headerOk = secretsMatch(headerSecret, config.webhookSecret)

  if (!urlOk || !headerOk) {
    console.warn('telegram.webhook.secret_mismatch', {
      urlOk,
      headerOk,
    })
    return new NextResponse(null, { status: 200 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    console.warn('telegram.webhook.invalid_json')
    return new NextResponse(null, { status: 200 })
  }

  const parsed = telegramUpdateSchema.safeParse(raw)
  if (!parsed.success) {
    console.warn('telegram.webhook.invalid_update', { issues: parsed.error.issues })
    return new NextResponse(null, { status: 200 })
  }

  try {
    await handleTelegramUpdate(parsed.data)
  } catch (err) {
    console.error('telegram.webhook.handler_failed', {
      updateId: parsed.data.update_id,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return new NextResponse(null, { status: 200 })
}
