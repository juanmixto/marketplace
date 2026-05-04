import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { getServerEnv } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

/**
 * Readiness probe (#1211).
 *
 * Sibling of `/api/healthcheck` (which is liveness — "Postgres responds
 * for the user-touching tables"). This endpoint goes one level further
 * and validates that every dependency the app NEEDS to take real money
 * is reachable RIGHT NOW:
 *
 *   - Postgres (raw `SELECT 1`, distinct from the per-model probes
 *     that healthcheck runs — schema drift is healthcheck's job, basic
 *     connectivity is ours).
 *   - Stripe (`balance.retrieve` — discovers a revoked API key, a
 *     half-rotated `STRIPE_SECRET_KEY`, or a Stripe-side incident).
 *   - Upstash Redis (REST `PING` — the rate limiter fails CLOSED on a
 *     500 from Upstash, which means checkout is throttled to nothing).
 *   - pg-boss (queue size on the canonical queue — if the boss can't
 *     reach Postgres, jobs back up silently and emails / refunds
 *     stall).
 *
 * The Load Balancer in front of the container should hit THIS endpoint,
 * not `/api/healthcheck`. Healthcheck stays as a cheap liveness signal
 * that answers "is the process alive enough to talk to its DB".
 *
 * Cached briefly (5s) per process to avoid hammering Stripe — `balance`
 * counts toward the Stripe API rate limit. The cache is invalidated on
 * the first failed read so a recovery is observed within one probe.
 *
 * Never 500s — every probe is wrapped and serialised.
 */

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Ok = { ok: true; latencyMs: number }
type Err = { ok: false; latencyMs: number; error: string }
type CheckResult = Ok | Err

interface ReadyResponse {
  ok: boolean
  checks: Record<string, CheckResult>
}

const CACHE_TTL_MS = 5_000

let cachedResponse: { at: number; response: ReadyResponse } | null = null

async function timed(fn: () => Promise<unknown>): Promise<CheckResult> {
  const start = Date.now()
  try {
    await fn()
    return { ok: true, latencyMs: Date.now() - start }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, latencyMs: Date.now() - start, error: message.slice(0, 300) }
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ])
}

async function probeDatabase(): Promise<CheckResult> {
  return timed(async () => {
    await withTimeout(db.$queryRaw`SELECT 1`, 1_000, 'db')
  })
}

async function probeStripe(): Promise<CheckResult> {
  return timed(async () => {
    const env = getServerEnv()
    const key = env.stripeSecretKey
    if (!key) throw new Error('STRIPE_SECRET_KEY missing')
    const stripe = new Stripe(key, { timeout: 2_000, maxNetworkRetries: 0 })
    await withTimeout(stripe.balance.retrieve(), 2_000, 'stripe')
  })
}

async function probeUpstash(): Promise<CheckResult> {
  return timed(async () => {
    const env = getServerEnv()
    const url = env.upstashRedisRestUrl
    const token = env.upstashRedisRestToken
    // Upstash is optional in dev. Treat absence as "skipped, ok" so the
    // ready endpoint doesn't false-positive on dev machines that
    // intentionally don't run a rate limiter.
    if (!url || !token) return
    const res = await fetchWithTimeout(`${url}/ping`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 1_500,
    })
    if (!res.ok) throw new Error(`upstash ${res.status}`)
  })
}

async function probeQueue(): Promise<CheckResult> {
  return timed(async () => {
    // Lazy import keeps the readiness route from booting pg-boss in
    // build / serverless cold starts when the queue is wired but not
    // strictly necessary for the request lifecycle.
    const { getQueue } = await import('@/lib/queue')
    const boss = await withTimeout(getQueue(), 2_000, 'queue.start')
    // `getQueueSize` returns the number of jobs in the queue. We don't
    // care about the value here — only that the call succeeds, proving
    // the boss can talk to its Postgres-backed `pgboss` schema.
    await withTimeout(boss.getQueueSize('default'), 1_500, 'queue.size')
  })
}

async function runProbes(): Promise<ReadyResponse> {
  const [database, stripe, upstash, queue] = await Promise.all([
    probeDatabase(),
    probeStripe(),
    probeUpstash(),
    probeQueue(),
  ])
  const checks: Record<string, CheckResult> = { database, stripe, upstash, queue }
  const ok = Object.values(checks).every((c) => c.ok)
  return { ok, checks }
}

export async function GET() {
  const now = Date.now()
  if (cachedResponse && cachedResponse.response.ok && now - cachedResponse.at < CACHE_TTL_MS) {
    return NextResponse.json(cachedResponse.response, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const response = await runProbes()
  // Only cache successful results — a failed probe should be re-checked
  // immediately so a recovery is observed within one polling interval.
  cachedResponse = response.ok ? { at: now, response } : null

  if (!response.ok) {
    logger.error('readiness.probe_failed', {
      failed: Object.entries(response.checks)
        .filter(([, r]) => !r.ok)
        .map(([k, r]) => ({ dep: k, latencyMs: r.latencyMs, error: (r as Err).error })),
    })
  }

  return NextResponse.json(response, {
    status: response.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
