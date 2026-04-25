import { NextResponse } from 'next/server'
import { cleanupExpiredIdempotencyKeys } from '@/lib/idempotency'
import { apiUnauthorized } from '@/lib/api-response'

// Daily sweep of expired IdempotencyKey rows. Schedule via Vercel cron
// (vercel.json): { "path": "/api/cron/cleanup-idempotency", "schedule": "0 3 * * *" }.
// 03:00 UTC keeps the window away from peak EU traffic.
//
// Auth: Vercel cron jobs include x-vercel-cron header automatically;
// when absent we require Bearer CRON_SECRET so the endpoint can also
// be triggered manually for testing without exposing the cleanup to
// arbitrary callers.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isAuthorized(req: Request): boolean {
  const fromVercelCron = req.headers.get('x-vercel-cron') !== null
  if (fromVercelCron) return true

  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${cronSecret}`
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return apiUnauthorized('Cron endpoint requires CRON_SECRET or Vercel cron header')
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
