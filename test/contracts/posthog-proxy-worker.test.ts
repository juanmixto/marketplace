/**
 * Contract: the PostHog reverse-proxy Worker preserves the invariants
 * that make it safe to run in front of raizdirecta.es. None of these
 * are runtime-tested today — the Worker runs in Cloudflare's edge,
 * not in our test runner — so this is static-analysis on the source
 * to prevent silent regressions.
 *
 * What we pin and why:
 *
 *   1. Route is exactly raizdirecta.es/ingest/*. Broadening it to
 *      *.raizdirecta.es would route dev + staging traffic through
 *      the Worker too, defeating the "dev stays directly connected
 *      for fast debugging" decision documented in the README.
 *
 *   2. Cookie / Set-Cookie stripping in BOTH directions. Forwarding
 *      raizdirecta.es session cookies to PostHog would leak
 *      authentication state to a third-party. Letting PostHog set
 *      cookies on raizdirecta.es origin would let it attach
 *      identifiers to our domain.
 *
 *   3. Upstream hosts match src/lib/posthog.ts and src/lib/flags.ts.
 *      The doc comments at those lines and at
 *      src/lib/security-headers.ts:111 ALL say "keep in lockstep
 *      with the Worker" — this test enforces that promise.
 *
 *   4. Stateless Worker. `wrangler.toml` must NOT declare KV /
 *      Durable Objects / R2 bindings. State means GDPR exposure
 *      questions ("what does the Worker remember about users?") that
 *      the README explicitly says we never want to answer.
 *
 *   5. The Worker does NOT fall back to status 200 on upstream
 *      failure. PostHog SDK retries on 5xx; a 200 with empty body
 *      would silently drop events.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const WORKER_SRC = 'infra/cloudflare/posthog-proxy/src/index.ts'
const WRANGLER = 'infra/cloudflare/posthog-proxy/wrangler.toml'
const APP_CLIENT_POSTHOG = 'src/lib/posthog.ts'
const APP_SERVER_POSTHOG = 'src/lib/flags.ts'

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('PostHog reverse-proxy Worker contract', () => {
  test('wrangler route targets the apex only, not dev/staging', () => {
    const cfg = read(WRANGLER)

    // The pattern must mention raizdirecta.es/ingest/* and NOT a
    // wildcard subdomain that would scoop up dev.* or staging.*.
    assert.match(
      cfg,
      /pattern\s*=\s*"raizdirecta\.es\/ingest\/\*"/,
      `${WRANGLER}: the route must be exactly raizdirecta.es/ingest/* — broadening to *.raizdirecta.es/ingest/* sends dev and staging through the Worker too. See infra/cloudflare/posthog-proxy/README.md "What the SDK sees" table.`
    )
    assert.doesNotMatch(
      cfg,
      /pattern\s*=\s*"\*\.raizdirecta\.es/,
      `${WRANGLER}: wildcard subdomain pattern is forbidden — it would intercept dev/staging.`
    )
  })

  test('worker strips Cookie / Set-Cookie in both directions', () => {
    const src = read(WORKER_SRC)

    // Strip Cookie before forwarding upstream.
    assert.match(
      src,
      /STRIP_REQUEST_HEADERS[\s\S]*?'cookie'/,
      `${WORKER_SRC}: must strip the 'cookie' header before forwarding to PostHog. Forwarding session cookies to a third party is a privacy leak.`
    )

    // Strip Set-Cookie from the upstream response.
    assert.match(
      src,
      /STRIP_RESPONSE_HEADERS[\s\S]*?'set-cookie'/,
      `${WORKER_SRC}: must strip 'set-cookie' from the upstream response. Letting PostHog set cookies on raizdirecta.es origin lets a third party attach identifiers to our domain.`
    )
  })

  test('upstream hosts are PostHog EU and match the app SDK config', () => {
    const src = read(WORKER_SRC)
    const clientCfg = read(APP_CLIENT_POSTHOG)
    const serverCfg = read(APP_SERVER_POSTHOG)

    // Worker must point at PostHog EU (api + assets).
    assert.match(
      src,
      /POSTHOG_API_HOST\s*=\s*'https:\/\/eu\.i\.posthog\.com'/,
      `${WORKER_SRC}: API upstream must be eu.i.posthog.com.`
    )
    assert.match(
      src,
      /POSTHOG_ASSET_HOST\s*=\s*'https:\/\/eu-assets\.i\.posthog\.com'/,
      `${WORKER_SRC}: asset upstream must be eu-assets.i.posthog.com.`
    )

    // The app SDK fallback must match — these three sites move together.
    // The doc comments at posthog.ts and flags.ts both reference this lockstep.
    assert.match(
      clientCfg,
      /https:\/\/eu\.i\.posthog\.com/,
      `${APP_CLIENT_POSTHOG}: client SDK fallback must remain eu.i.posthog.com so dev/staging stay on the same upstream the Worker uses in prod.`
    )
    assert.match(
      serverCfg,
      /https:\/\/eu\.i\.posthog\.com/,
      `${APP_SERVER_POSTHOG}: server SDK fallback must remain eu.i.posthog.com.`
    )
  })

  test('worker is stateless — no KV/DO/R2 bindings', () => {
    const cfg = read(WRANGLER)

    // Each of these would make the Worker stateful, which the README
    // explicitly forbids. If we ever need state, that decision should
    // come with a GDPR review and a doc update — both happen by
    // failing this test and forcing the conversation.
    for (const binding of ['kv_namespaces', 'durable_objects', 'r2_buckets', 'd1_databases']) {
      assert.doesNotMatch(
        cfg,
        new RegExp(`^\\s*\\[\\[${binding}`, 'm'),
        `${WRANGLER}: ${binding} binding is forbidden — see README "Why these specific design choices".`
      )
    }
  })

  test('worker returns 502 on upstream failure, not 200', () => {
    const src = read(WORKER_SRC)

    // PostHog SDK retries on 5xx and gives up on 2xx. Returning 200
    // with empty body when upstream is down would silently drop
    // events forever — exactly the silent-failure class of bug that
    // motivated the entire observability stack (#1091, #1093).
    assert.match(
      src,
      /catch[\s\S]*?return new Response\(null,\s*\{\s*status:\s*502/,
      `${WORKER_SRC}: upstream failure must return 502 (not 200). PostHog SDK retries on 5xx; a silent 200 would lose events forever.`
    )
  })
})
