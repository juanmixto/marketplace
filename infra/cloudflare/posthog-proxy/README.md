# PostHog reverse proxy (Cloudflare Worker)

A 60-line Cloudflare Worker that proxies PostHog ingestion through `raizdirecta.es/ingest/*` so ad-blockers don't drop ~10-25% of events. Without this, the Buyer Mutations Health dashboard and the funnel insights documented in [`docs/posthog-dashboards.md`](../../../docs/posthog-dashboards.md) systematically under-report.

## Why a Worker (not a Next.js rewrite, not a CNAME)

- **Next.js rewrite**: would route every analytics event through the app server. At our scale today it's fine, but it's a moving target — every analytics call becomes a Node function invocation. Workers are ~free at the edge.
- **CNAME `ph.raizdirecta.es` → `eu.i.posthog.com`**: modern ad-blockers detect obvious analytics subdomains (`ph.*`, `track.*`, `analytics.*`) by heuristic. Doesn't work.
- **Cloudflare Worker on `raizdirecta.es/ingest/*`**: same origin as the app, so ad-blockers can't filter it without breaking the site itself. PostHog documents this as the production-grade pattern. ✓

The worker code ([`src/index.ts`](src/index.ts)) is ~60 lines, stateless, no auth — strips `/ingest` from the path, forwards to PostHog upstream, drops Cookie / Set-Cookie in both directions.

## What the SDK sees

| Environment | `NEXT_PUBLIC_POSTHOG_HOST` | Effective upstream |
|---|---|---|
| Production (`raizdirecta.es`) | `https://raizdirecta.es/ingest` | Worker → `eu.i.posthog.com` |
| Staging (`staging.raizdirecta.es`) | unset | Direct → `eu.i.posthog.com` |
| Dev (`dev.raizdirecta.es`, `dev.feldescloud.com`) | unset | Direct → `eu.i.posthog.com` |
| Local (`localhost:3000`) | unset | Direct → `eu.i.posthog.com` |

Only production routes through the Worker. Dev and staging keep the direct connection so debugging doesn't need a Worker deploy round-trip — the developers hitting those URLs aren't the ad-blocker-using buyers we care about.

## First-time deploy

Prerequisites: Cloudflare account that owns the `raizdirecta.es` zone, and `wrangler` CLI authenticated to it.

```sh
cd infra/cloudflare/posthog-proxy
npm install
npx wrangler login          # only the first time per machine
npx wrangler deploy
```

Wrangler will create the Worker, register the route `raizdirecta.es/ingest/*`, and tell you the deploy URL. The route is the source of truth — the Worker is **not** active until that route is registered.

Verify upstream connectivity (replace `phc_...` with the project key):

```sh
curl -i 'https://raizdirecta.es/ingest/decide?v=3' \
  -H 'Content-Type: application/json' \
  -d '{"api_key":"phc_BZE6p5XrToHwHVMXBZP2kxMRY7xgSxbgnknjEgYioKSi","distinct_id":"smoke-test"}'
```

Expected: HTTP 200 with a JSON body containing `featureFlags`. If it 502s, the Worker isn't reaching PostHog (check the upstream hosts in [`src/index.ts`](src/index.ts)).

Then set the env var in production hosting (Vercel / Cloudflare Tunnel host secrets / wherever the production Next.js process gets its env):

```
NEXT_PUBLIC_POSTHOG_HOST=https://raizdirecta.es/ingest
```

This is read by both the client SDK ([`src/lib/posthog.ts:15`](../../../src/lib/posthog.ts)) and the server SDK ([`src/lib/flags.ts:61`](../../../src/lib/flags.ts)). One var flips both at once.

After redeploy, verify with Brave Shields **ON** that events reach PostHog Live (Activity → Live events). That is the whole point of this Worker — Shields ON is the typical user state, not the exception.

## Operating

### Tail logs

```sh
npx wrangler tail
```

Real-time log stream. Useful when the SDK reports failures and you want to see whether the Worker is hitting upstream errors or the request is reaching the Worker at all.

### Metrics

Cloudflare Dashboard → Workers & Pages → `raizdirecta-posthog-proxy` → Metrics.

Watch for:

- **Errors > 0.1%**: indicates upstream PostHog issues or a code bug. PostHog status: <https://status.posthog.com>.
- **CPU time spike**: unusual; this Worker should run in single-digit ms. A spike means a body-buffering bug or a regex issue.
- **Sustained > 10 req/s on a free plan**: bumps you toward the 100k req/day free limit (~1.15 req/s sustained). At that point you have real traffic and either upgrade the plan or revisit the Next.js-rewrite alternative.

### Rotate the upstream host

PostHog has historically rotated asset CDNs. If they move:

1. Update `POSTHOG_API_HOST` and/or `POSTHOG_ASSET_HOST` in [`src/index.ts`](src/index.ts).
2. Update the matching defaults in [`src/lib/posthog.ts:15`](../../../src/lib/posthog.ts) and [`src/lib/flags.ts:61`](../../../src/lib/flags.ts) (the doc comment there says "in lockstep" — this is what it means).
3. Update the CSP comment in [`src/lib/security-headers.ts`](../../../src/lib/security-headers.ts) if the new host doesn't match `*.posthog.com`.
4. `npx wrangler deploy`.

### Rollback (under 30 seconds)

If the Worker misbehaves and you need to immediately revert to direct connections:

1. Cloudflare Dashboard → Workers & Pages → Routes → delete `raizdirecta.es/ingest/*`.
2. Production hosting env: unset `NEXT_PUBLIC_POSTHOG_HOST` (so the SDK falls back to `https://eu.i.posthog.com`).
3. Trigger a production redeploy with the new env (or wait for the next deploy — the Worker route deletion alone breaks the proxy, so events fail until step 2 lands; that's acceptable for a brief window).

For users with shields ON, events stop reaching PostHog after step 1 (same as before the Worker existed). For users with shields OFF, events resume reaching PostHog as soon as step 2 lands. Net effect of rollback: pre-Worker state.

## Why these specific design choices

- **No state (`KV`/`DO`/`R2`)**: state means GDPR exposure ("what does the Worker remember?"). The Worker is a dumb pipe; it forgets the request the moment it returns the response.
- **No caching**: caching events would change semantics. Caching `/decide` (feature flags) would defeat the kill-switch design — `kill-auth-social` flipping to `true` must propagate within seconds.
- **No auth**: the PostHog API key is in the request body sent by the SDK. The Worker doesn't know or care.
- **Strip `Cookie` and `Set-Cookie`**: privacy + correctness. We don't want raizdirecta.es session cookies leaking to PostHog, nor PostHog cookies appearing on raizdirecta.es origin.
- **`redirect: 'manual'`**: if PostHog redirects, surface that to the SDK rather than following server-side. The SDK is the right place to decide.
- **502 on upstream failure (not 200 with empty body)**: PostHog SDK retries with backoff on 5xx. A silent 200 would lose events.

## Related code

- [`src/index.ts`](src/index.ts) — the Worker.
- [`wrangler.toml`](wrangler.toml) — route + name.
- [`src/lib/posthog.ts:15`](../../../src/lib/posthog.ts) — client SDK config flow.
- [`src/lib/flags.ts:61`](../../../src/lib/flags.ts) — server SDK config flow.
- [`src/lib/security-headers.ts:111`](../../../src/lib/security-headers.ts) — CSP allowlist (still includes `*.posthog.com` for now; can be tightened in a follow-up PR once the proxy is verified stable).
- [`docs/posthog-dashboards.md`](../../../docs/posthog-dashboards.md) — what to do with the events once they arrive.
