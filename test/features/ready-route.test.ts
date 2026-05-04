import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Structural pins for /api/ready (#1211).
 *
 * Readiness is the LB-facing contract. Outside monitors and
 * docker-compose / Kubernetes liveness probes will start hitting this
 * path. Removing or weakening a probe silently can leave the LB
 * routing traffic to a broken pod — these tests catch that early.
 */

const ROUTE = 'src/app/api/ready/route.ts'

function routeContent(): string {
  return readFileSync(join(process.cwd(), ROUTE), 'utf-8')
}

test('ready route exists', () => {
  assert.ok(routeContent().length > 0)
})

test('ready exports a GET handler and is force-dynamic', () => {
  const content = routeContent()
  assert.match(content, /export\s+async\s+function\s+GET\s*\(/)
  assert.match(content, /export\s+const\s+dynamic\s*=\s*'force-dynamic'/)
})

test('ready probes every dependency required to take real money', () => {
  const content = routeContent()
  // These four are the contract. Any removal MUST update
  // docs/runbooks/sentry.md AND any external alerting that polls /api/ready.
  const required = ['probeDatabase', 'probeStripe', 'probeUpstash', 'probeQueue']
  for (const fn of required) {
    assert.ok(
      content.includes(fn),
      `/api/ready must define ${fn} — removal requires runbook + alerting update.`,
    )
  }
})

test('ready returns 503 on any probe failure, 200 on all-ok, never 500', () => {
  const content = routeContent()
  // Every probe is wrapped in `timed()` which catches and serialises.
  // The handler then computes ok = every probe ok, and the response
  // status follows. A 500 here defeats the point of a probe that
  // exists to surface dependency outages.
  assert.match(content, /status:\s*response\.ok\s*\?\s*200\s*:\s*503/)
  assert.match(content, /try\s*\{[\s\S]{0,200}catch/)
})

test('ready response never caches downstream', () => {
  const content = routeContent()
  assert.ok(
    content.includes("'Cache-Control': 'no-store'"),
    'Cache-Control: no-store required so the LB never sees a stale 200 after a real outage.',
  )
})

test('ready logs readiness.probe_failed when any dependency is down', () => {
  const content = routeContent()
  // The scope is part of the observability contract — alerts/queries
  // grep for `readiness.probe_failed`. Renaming silently breaks them.
  assert.ok(
    content.includes("'readiness.probe_failed'"),
    'logger.error must use scope readiness.probe_failed (pinned for alerting).',
  )
})

test('ready Stripe probe uses balance.retrieve (cheapest authenticated call)', () => {
  const content = routeContent()
  // Picking a different Stripe call would either be more expensive
  // (rate-limit pressure) or more side-effecty (e.g. listing
  // PaymentIntents). balance.retrieve is the canonical readiness call.
  assert.match(content, /stripe\.balance\.retrieve/)
})

test('ready Upstash probe is optional in dev (skipped when env unset)', () => {
  const content = routeContent()
  // We allow `UPSTASH_REDIS_REST_URL` to be absent in dev/test without
  // failing readiness. Remove this guard only after Upstash becomes a
  // hard production dependency in every environment.
  assert.ok(
    content.includes('if (!url || !token) return'),
    'Upstash probe must short-circuit when env is unset (dev convenience).',
  )
})
