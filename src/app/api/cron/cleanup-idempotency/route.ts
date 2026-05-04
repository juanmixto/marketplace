import { NextResponse } from 'next/server'
import { cleanupExpiredIdempotencyKeys } from '@/lib/idempotency'
import { apiUnauthorized } from '@/lib/api-response'

// Daily sweep of expired IdempotencyKey rows. Schedule via the laptop's
// systemd timer / cron — see docs/runbooks/. 03:00 UTC keeps the window
// away from peak EU traffic.
//
// Auth (#1150): only Bearer CRON_SECRET is accepted. The previous
// implementation also allowed an `x-vercel-cron` request header to
// bypass the secret, which made sense when the app ran on Vercel but
// is unsafe on the current Cloudflare-tunneled topology — Cloudflare
// does not strip arbitrary client headers, so any external caller
// could set it to bypass the secret. If we ever go back to Vercel
// the header check can be re-introduced behind a stripping layer.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${cronSecret}`
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return apiUnauthorized('Cron endpoint requires CRON_SECRET')
  }

  const startedAt = Date.now()
  try {
    const deleted = await cleanupExpiredIdempotencyKeys()
    return NextResponse.json({
      ok: true,
      deleted,
      durationMs: Date.now() - startedAt,
    })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'unknown error',
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    )
  }
}
