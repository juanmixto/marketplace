/**
 * PostHog reverse proxy.
 *
 * Why this exists:
 *   Ad-blockers (Brave Shields by default, uBlock Origin, AdGuard,
 *   Pi-hole, NextDNS) recognize *.posthog.com as a tracker and drop
 *   the request at the browser. PostHog estimates this affects
 *   10-25% of real users. Funnels and the Buyer Mutations Health
 *   dashboard (docs/posthog-dashboards.md § Dashboard 4) become
 *   unreliable when that share is invisible.
 *
 *   Routing the SDK through a same-origin path on raizdirecta.es
 *   evades the block: ad-blockers don't list raizdirecta.es as a
 *   tracker, so the request goes through.
 *
 * What this Worker does:
 *   1. Strips the `/ingest` prefix from the request path.
 *   2. Forwards everything else (method, headers, body, query) to
 *      PostHog upstream — eu.i.posthog.com for ingestion,
 *      eu-assets.i.posthog.com for the bundled JS assets PostHog
 *      serves (recorder.js, surveys, feature-flag eval).
 *   3. Strips Cookie / Set-Cookie headers in both directions: PostHog
 *      doesn't need session cookies from raizdirecta.es, and we MUST
 *      NOT inject PostHog-set cookies into the raizdirecta.es origin.
 *   4. Returns the upstream response unchanged otherwise.
 *
 * What this Worker does NOT do:
 *   - Auth. The PostHog Project API Key lives in the request body
 *     (sent by the SDK), not in the Worker. The Worker is a dumb
 *     pipe.
 *   - Caching. Every request reaches upstream. Caching event ingest
 *     would change semantics; caching feature-flag responses would
 *     break the kill switches.
 *   - Logging. Cloudflare's built-in Worker analytics are enough.
 *     Custom logging would mean deciding what is and isn't PII.
 *
 * Upstream hosts (PostHog EU region — config-flow lock with
 * src/lib/posthog.ts:15 and src/lib/flags.ts:61):
 */
const POSTHOG_API_HOST = 'https://eu.i.posthog.com'
const POSTHOG_ASSET_HOST = 'https://eu-assets.i.posthog.com'

const STRIP_REQUEST_HEADERS = ['cookie', 'host'] as const
const STRIP_RESPONSE_HEADERS = ['set-cookie'] as const

const worker = {
  async fetch(request: Request): Promise<Response> {
    const incoming = new URL(request.url)

    // Reject anything that doesn't start with /ingest. The Worker
    // route pattern in wrangler.toml already restricts to /ingest/*,
    // but this is a belt-and-suspenders check in case the route is
    // ever broadened by accident.
    if (!incoming.pathname.startsWith('/ingest')) {
      return new Response('Not Found', { status: 404 })
    }

    // PostHog asset paths come through as `/ingest/static/...`
    // (recorder.js etc); ingestion paths are `/ingest/e/`,
    // `/ingest/decide`, `/ingest/array/...`. We pick the upstream
    // host based on the prefix after `/ingest`.
    const upstreamPath = incoming.pathname.replace(/^\/ingest/, '') || '/'
    const isAsset = upstreamPath.startsWith('/static/')
    const upstreamHost = isAsset ? POSTHOG_ASSET_HOST : POSTHOG_API_HOST
    const upstreamUrl = upstreamHost + upstreamPath + incoming.search

    // Build a clean header set: drop cookies (privacy + we don't need
    // them) and Host (the runtime sets it to the upstream host).
    const forwardHeaders = new Headers(request.headers)
    for (const h of STRIP_REQUEST_HEADERS) forwardHeaders.delete(h)

    let upstreamResponse: Response
    try {
      upstreamResponse = await fetch(upstreamUrl, {
        method: request.method,
        headers: forwardHeaders,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        // redirect: 'manual' so we surface PostHog redirects to the
        // browser as-is rather than following them server-side and
        // hiding the eventual URL from the SDK.
        redirect: 'manual',
      })
    } catch {
      // Upstream unreachable: respond 502 with no body. The PostHog
      // SDK retries with backoff on 5xx — we don't need a custom
      // body. Returning 200 with empty payload would silently
      // swallow lost events.
      return new Response(null, { status: 502 })
    }

    // Strip cookies from the upstream response so PostHog can't
    // set cookies on the raizdirecta.es origin. Defense in depth:
    // PostHog doesn't currently set cookies on EU ingest endpoints,
    // but a future change there must not silently broaden our
    // cookie surface.
    const responseHeaders = new Headers(upstreamResponse.headers)
    for (const h of STRIP_RESPONSE_HEADERS) responseHeaders.delete(h)

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    })
  },
}

export default worker
