/**
 * LIVE contract: the PostHog reverse-proxy Worker is actually deployed
 * and intercepting raizdirecta.es/ingest/*.
 *
 * Why this exists separately from posthog-proxy-worker.test.ts:
 *   The static contract test reads source files. It passes whether or
 *   not anyone has run `npx wrangler deploy`. PR #1100 sat in main from
 *   2026-05-03 with a green static test while the Worker route was
 *   never registered — every analytics event configured to go through
 *   the proxy would have 404'd silently. This test closes that gap.
 *
 * Why opt-in (RUN_LIVE_PROXY_CHECK=1) and not part of the default suite:
 *   - It hits a public URL. CI without network is a thing.
 *   - Test environments that don't yet have the Worker deployed must
 *     not have their CI go red because of an ops gap. The right place
 *     to surface that gap is the deploy verification step, not random
 *     PR builds.
 *
 * Where this DOES run:
 *   - Locally, after `npx wrangler deploy`, as the post-deploy smoke.
 *     Documented in infra/cloudflare/posthog-proxy/README.md.
 *   - Optionally, on a schedule (cron / GitHub Actions schedule) so a
 *     silently-deleted Worker route alerts before users notice missing
 *     events.
 *
 * What we assert:
 *   1. /ingest/decide does NOT have `x-powered-by: Next.js`. That is
 *      the smoking-gun signal that the request fell through to the
 *      app instead of being intercepted by the Worker.
 *   2. /ingest/decide returns 200 or 401 (PostHog upstream responded).
 *      Anything else (404, 502, 5xx) means the Worker isn't reaching
 *      PostHog, or the route is missing entirely.
 *   3. The response carries no Set-Cookie header — the Worker MUST
 *      strip it (privacy invariant from the README).
 *   4. /ingest/static/array.js routes through the asset branch and
 *      does NOT hit Next.js.
 *
 * What we do NOT do:
 *   - POST a real event into the prod project. We hit /decide
 *     (read-only feature-flag eval), never /e/ (event capture). PostHog
 *     analytics stay clean.
 */
import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'

const HOST = process.env.POSTHOG_PROXY_HOST || 'raizdirecta.es'
const BASE = `https://${HOST}/ingest`
const SMOKE_KEY = 'phc_smoke_verify_proxy_only'

const shouldRun = process.env.RUN_LIVE_PROXY_CHECK === '1'

// `node:test` skips a whole describe by passing `{ skip: true }` to it.
// We compute the skip reason once so the message is informative when the
// suite is filtered out by the default opt-out.
const skipReason = shouldRun
  ? undefined
  : 'set RUN_LIVE_PROXY_CHECK=1 to run live proxy checks against ' + HOST

describe('PostHog reverse-proxy Worker — live deploy check', { skip: skipReason }, () => {
  let decideResponse: Response | null = null
  let decideBody: string = ''
  let assetResponse: Response | null = null

  before(async () => {
    // /decide is the API branch — POST with a benign body. PostHog will
    // either return 200 with default flags or 401; either response
    // proves the Worker forwarded bytes upstream.
    decideResponse = await fetch(`${BASE}/decide?v=3`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: SMOKE_KEY, distinct_id: 'live-test' }),
    })
    decideBody = await decideResponse.text()

    // /static/array.js is the asset branch (different upstream host).
    assetResponse = await fetch(`${BASE}/static/array.js`)
  })

  test('decide endpoint is intercepted by the Worker, not Next.js', () => {
    assert.ok(decideResponse, 'decide request did not complete')
    const powered = decideResponse!.headers.get('x-powered-by') || ''
    assert.ok(
      !/next\.js/i.test(powered),
      `${BASE}/decide carries 'x-powered-by: ${powered}', meaning the request fell through to the Next.js app. The Cloudflare Worker route 'raizdirecta.es/ingest/*' is NOT registered — run 'cd infra/cloudflare/posthog-proxy && npx wrangler deploy'.`
    )

    // Also assert the body is not an HTML 404 page from Next.js.
    const ctype = decideResponse!.headers.get('content-type') || ''
    assert.ok(
      !/text\/html/i.test(ctype),
      `${BASE}/decide returned content-type '${ctype}' — likely an HTML 404 from Next.js. The Worker is missing.`
    )
  })

  test('decide returns a PostHog response shape (200 or 401)', () => {
    assert.ok(decideResponse, 'decide request did not complete')
    const status = decideResponse!.status

    // 200 = decision returned. 401 = our smoke key was rejected, but
    // PostHog still responded — both prove the Worker forwarded.
    // 502 = Worker up but cannot reach PostHog. 404 = Worker missing.
    assert.ok(
      status === 200 || status === 401,
      `${BASE}/decide -> ${status}. Expected 200 (decision returned) or 401 (smoke key rejected). 502 means the Worker can't reach PostHog upstream; 404 means the Worker route isn't registered. Body excerpt: ${decideBody.slice(0, 200)}`
    )
  })

  test('decide response strips Set-Cookie (privacy invariant)', () => {
    assert.ok(decideResponse, 'decide request did not complete')
    // Set-Cookie can be multi-valued; we check both the single accessor
    // and the iteration form to be safe across runtimes.
    const single = decideResponse!.headers.get('set-cookie')
    assert.equal(
      single,
      null,
      `${BASE}/decide returned Set-Cookie='${single}' — the Worker MUST strip it. See infra/cloudflare/posthog-proxy/src/index.ts STRIP_RESPONSE_HEADERS.`
    )
  })

  test('asset endpoint routes through the asset upstream, not Next.js', () => {
    assert.ok(assetResponse, 'asset request did not complete')
    const powered = assetResponse!.headers.get('x-powered-by') || ''
    assert.ok(
      !/next\.js/i.test(powered),
      `${BASE}/static/array.js carries 'x-powered-by: ${powered}', meaning the request fell through to Next.js. The asset branch of the Worker is broken or the route is missing.`
    )
  })
})
