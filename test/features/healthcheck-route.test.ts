import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Structural pins for /api/healthcheck (#522).
 *
 * The route is operational infrastructure — the doctor script and any
 * external monitor depend on its shape. These tests catch accidental
 * removal of probes or changes that would break the script.
 */

const ROUTE = 'src/app/api/healthcheck/route.ts'

function routeContent(): string {
  return readFileSync(join(process.cwd(), ROUTE), 'utf-8')
}

test('healthcheck route exists', () => {
  assert.ok(routeContent().length > 0)
})

test('healthcheck exports a GET handler', () => {
  const content = routeContent()
  assert.match(content, /export\s+async\s+function\s+GET\s*\(/)
})

test('healthcheck probes every model known to have drifted or centrally matter', () => {
  const content = routeContent()
  // These are the seven probes the doctor script + outside monitors
  // rely on. Removing any requires updating the script AND any
  // external alerting.
  const required = [
    "probe('user'",
    "probe('vendor'",
    "probe('product'",
    "probe('order'",
    "probe('payment'",
    "probe('subscription'",
    "probe('webhookDeadLetter'",
  ]
  for (const pattern of required) {
    assert.ok(
      content.includes(pattern),
      `healthcheck must include ${pattern}. If removed intentionally, update doctor + this test.`
    )
  }
})

test('healthcheck Order probe specifically selects checkoutAttemptId (drift regression guard)', () => {
  const content = routeContent()
  // The April 2026 incident was ColumnNotFound on Order.checkoutAttemptId.
  // Pinning this select keeps the probe's resolution as fine as the
  // bug that motivated it.
  assert.match(
    content,
    /db\.order\.findFirst[\s\S]{1,200}checkoutAttemptId/,
    'Order probe must explicitly select checkoutAttemptId — see April 2026 drift incident.'
  )
})

test('healthcheck never reaches a 500 — any throw is caught inside probe()', () => {
  const content = routeContent()
  // The contract: every failing probe returns `{ok: false, error}`.
  // The handler itself returns 503 on any failure, 200 on all-ok.
  // A 500 on /api/healthcheck would defeat its purpose as a probe.
  assert.ok(
    content.includes("status: allOk ? 200 : 503"),
    'GET must return 200 on success, 503 on any probe failure — never 500.'
  )
  assert.ok(
    content.includes('try {') && content.includes('catch'),
    'probe() wrapper must use try/catch so individual failures never bubble.'
  )
})

test('healthcheck response never caches (operators rely on live status)', () => {
  const content = routeContent()
  assert.ok(
    content.includes("'Cache-Control': 'no-store'"),
    'healthcheck must set Cache-Control: no-store so CDN / SW never serve stale health.'
  )
})

test('healthcheck is force-dynamic (no Next static optimization)', () => {
  const content = routeContent()
  assert.match(content, /export\s+const\s+dynamic\s*=\s*'force-dynamic'/)
})

test('healthcheck does NOT import any session helper (public by design)', () => {
  const content = routeContent()
  const forbidden = [
    'getActionSession',
    'requireVendor',
    'requireAdmin',
    'requireBuyer',
    'from \'@/lib/auth\'',
  ]
  for (const keyword of forbidden) {
    assert.ok(
      !content.includes(keyword),
      `healthcheck must stay public — found auth helper ${keyword}. External monitors cannot authenticate.`
    )
  }
})

test('healthcheck logs probe failures at error level', () => {
  const content = routeContent()
  assert.match(
    content,
    /logger\.error\(['"]healthcheck\.probe_failed['"]/,
    'Failed probes must emit logger.error("healthcheck.probe_failed", ...) so existing log alerts fire.'
  )
})
