import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'

/**
 * Synthetic health probe.
 *
 * Does ONE tiny Prisma query against every model that has historically
 * been a source of schema drift (Order, Vendor, Subscription, Payment,
 * User, Product). Each query is wrapped individually so we can report
 * which model failed — a ColumnNotFound on Order.checkoutAttemptId
 * shows up as { checks: { order: { ok: false, error: "..." } } }
 * instead of a generic 500.
 *
 * Intentionally public (no auth): operators and external monitors need
 * to hit this without credentials. Leaks no user data — every query is
 * `count({ take: 0 })` equivalent (or a trivial `findFirst` that selects
 * only the id). Added to PUBLIC_API_ROUTES with a documented reason.
 *
 * Response shape:
 *   200 { ok: true, checks: { [model]: { ok: true } } }
 *   503 { ok: false, checks: { [model]: { ok, error? } } }
 *
 * Never 500s — any thrown error is caught and serialized. A 500 here
 * would defeat the point of a probe that exists to diagnose 500s.
 */

export const dynamic = 'force-dynamic'
export const revalidate = 0

type CheckResult = { ok: true } | { ok: false; error: string }

async function probe(label: string, fn: () => Promise<unknown>): Promise<[string, CheckResult]> {
  try {
    await fn()
    return [label, { ok: true }]
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return [label, { ok: false, error: message.slice(0, 300) }]
  }
}

// #1159: 60 req/min/IP is ~6× what any reasonable monitor needs and
// caps a flood at ~7 queries × 60 = 420 Postgres pings per minute per
// attacker IP. Fail-OPEN by design — a Redis outage must NOT take down
// the endpoint operators use to detect THE Redis outage.
const HEALTHCHECK_LIMIT = 60
const HEALTHCHECK_WINDOW_SECONDS = 60

export async function GET(req: NextRequest) {
  const limit = await checkRateLimit(
    'healthcheck',
    getClientIP(req),
    HEALTHCHECK_LIMIT,
    HEALTHCHECK_WINDOW_SECONDS,
  )
  if (!limit.success) {
    return NextResponse.json(
      { ok: false, error: 'rate-limited' },
      {
        status: 429,
        headers: {
          'Retry-After': Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000)).toString(),
          'X-RateLimit-Limit': String(HEALTHCHECK_LIMIT),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': limit.resetAt.toString(),
          'Cache-Control': 'no-store',
        },
      },
    )
  }
  // Each probe exercises a column set that has broken in the past OR is
  // central to the buy/sell flow. Queries are deliberately minimal so
  // the route stays fast enough to poll every 30s.
  const probes = await Promise.all([
    probe('user', () => db.user.findFirst({ select: { id: true } })),
    probe('vendor', () => db.vendor.findFirst({ select: { id: true, status: true } })),
    probe('product', () =>
      db.product.findFirst({ select: { id: true, basePrice: true, stock: true } })
    ),
    // Order is the model that produced the April 2026 ColumnNotFound on
    // checkoutAttemptId — selecting the full row via "*" semantics would
    // be more aggressive but less predictable. Naming the critical
    // columns keeps the probe targeted.
    probe('order', () =>
      db.order.findFirst({
        select: { id: true, checkoutAttemptId: true, paymentStatus: true },
      })
    ),
    probe('payment', () =>
      db.payment.findFirst({ select: { id: true, status: true, providerRef: true } })
    ),
    probe('subscription', () =>
      db.subscription.findFirst({
        select: { id: true, status: true, lastStripeEventAt: true },
      })
    ),
    // Sub-issue: added 2026-04-17 after the checkoutAttemptId drift
    // incident. The DLQ table is new-ish and has drifted before — keep
    // a probe so operators see it here first, not as a 500 on oncall.
    probe('webhookDeadLetter', () => db.webhookDeadLetter.findFirst({ select: { id: true } })),
  ])

  const checks: Record<string, CheckResult> = {}
  let allOk = true
  for (const [label, result] of probes) {
    checks[label] = result
    if (!result.ok) allOk = false
  }

  if (!allOk) {
    // Log at error level so this shows up in existing observability
    // infrastructure even when the caller only looks at the HTTP code.
    logger.error('healthcheck.probe_failed', {
      failedModels: Object.entries(checks)
        .filter(([, r]) => !r.ok)
        .map(([k]) => k),
    })
  }

  return NextResponse.json(
    { ok: allOk, checks },
    {
      status: allOk ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
