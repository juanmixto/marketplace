---
summary: Cómo investigar un error en Sentry, mantener el PII scrubber, y reaccionar a alertas. Required reading before touching `src/lib/sentry/*` or shipping a new scrubber pattern.
audience: agents,humans
read_when: investigar un error reportado por Sentry; añadir/modificar reglas del scrubber; responder a "PII filtrada"; configurar DSN o release tagging
---

# Sentry runbook

Practical recipes for working with Sentry on this codebase: setup
(DSN + release + sampling), investigation (filtering by `correlationId`,
`domain.scope`, `app_env`, release), the **PII scrubber contract**
(every new pattern needs a test), and the playbook for the four common
"something looks off in Sentry" scenarios.

This runbook complements [`payment-incidents.md`](payment-incidents.md),
whose **Step 0** says *"always look at Sentry first"*. If the user
reported a payment problem, start there; this doc is for everything else
(and for maintaining Sentry itself).

## Setup

### Environment variables

All Sentry env vars are documented in [`.env.example`](../../.env.example)
(§ ERROR TRACKING block). They are **all optional**: when no DSN is set
the SDK is a no-op and nothing leaves the process. This is intentional —
local dev and tests must never talk to a real Sentry project.

| Var | Where read | Purpose |
|---|---|---|
| `SENTRY_DSN` | server runtime + edge | Server / edge ingestion endpoint. |
| `NEXT_PUBLIC_SENTRY_DSN` | browser bundle | Browser ingestion endpoint. Webpack inlines `NEXT_PUBLIC_*` only — server `SENTRY_DSN` will not survive into the client bundle. |
| `SENTRY_ENVIRONMENT` | `loadSentryConfig()` | Explicit override of the `environment` tag. Kept for back-compat; prefer `APP_ENV`. |
| `APP_ENV` / `NEXT_PUBLIC_APP_ENV` | `loadSentryConfig()` | Canonical environment dimension since #1094. Allowed: `development` \| `staging` \| `production`. Distinguishes staging from production (both `NODE_ENV=production`). |
| `NEXT_PUBLIC_COMMIT_SHA` | `loadSentryConfig()` | Release tag — auto-stamped by `next.config.ts` from `git rev-parse` at build/dev. Falls back to `VERCEL_GIT_COMMIT_SHA`. |
| `SENTRY_TRACES_SAMPLE_RATE` | `buildTracesSampler()` | Base sample rate for performance traces. Default `0.1` (10 %). Checkout routes are bumped to `0.25` automatically — see [`src/lib/sentry/sampler.ts`](../../src/lib/sentry/sampler.ts). |
| `SENTRY_REPLAYS_SESSION_SAMPLE_RATE` | client init | Browser session replays. Default `0` — costs and privacy surface make this opt-in. |
| `SENTRY_REPLAYS_ONERROR_SAMPLE_RATE` | client init | Browser replays on crash. Default `0.5` (50 % of sessions that error). |

The precedence inside `loadSentryConfig()` is:

```
environment =
  SENTRY_ENVIRONMENT           // explicit override
    ?? APP_ENV                 // Phase 5.2 canonical
    ?? NEXT_PUBLIC_APP_ENV     // browser mirror
    ?? (NODE_ENV === 'production' ? 'production' : 'development')
```

### Where the env vars live

- [`.env.example`](../../.env.example) — all Sentry vars commented-out
  with sample values. This is the authoritative reference.
- `.env.production.example` / `.env.staging.example` — describe `APP_ENV`
  values per environment but do **not** carry the DSN. Real DSNs live in
  the secret store, never in committed files.
- Production DSN + sample-rate values are managed alongside the rest of
  the deploy secrets (Bitwarden vault → marketplace deployment item).

### Verifying release tagging post-deploy (#1214)

The `release` tag is what powers "first seen on latest release" alerts
and per-deploy regression hunts. If a deploy ships with `release:
undefined`, those alerts go silent. Verify after every first-deploy of
a new environment, and quarterly thereafter:

1. **Check the running build identity:**

   ```bash
   curl -s https://raizdirecta.es/api/version | jq .
   ```

   Should return `{ commit: "<sha7>", branch: "...", buildTime: "..." }`.
   If `commit` is `"unknown"`, the build args didn't reach the Dockerfile —
   `scripts/deploy-local-env.sh` did NOT export `NEXT_PUBLIC_COMMIT_SHA`
   before `compose build app`. The structural test
   `test/contracts/sentry-release-wiring.test.ts` guards this in CI; if it's
   green and `/api/version` still says `unknown`, suspect a manual `docker build`
   that bypassed the deploy script.

2. **Confirm the bundle has the SHA inlined:**

   ```bash
   docker exec marketplaceprod-app-1 \
     sh -c "grep -roh '\"<sha7>\"' /app/.next/static | head -3"
   ```

   Replace `<sha7>` with the value from step 1. A non-empty grep result
   means Next.js inlined `process.env.NEXT_PUBLIC_COMMIT_SHA` correctly.

3. **Fire a canary error and verify the Sentry release tag:**

   ```bash
   curl -s -X POST https://raizdirecta.es/api/canary/error \
     -H 'Authorization: Bearer $CANARY_TOKEN'
   ```

   (Endpoint TBD — until it exists, trigger any benign 500 on a stage
   build and confirm the resulting Sentry issue tags
   `release:<sha7>`.) The id must match `/api/version`.

If any step fails, check the chain in
`test/contracts/sentry-release-wiring.test.ts` against the actual
deploy artefacts.

### Init files

```
sentry.server.config.ts   ← Node runtime    (imported by src/instrumentation.ts at boot)
sentry.client.config.ts   ← Browser bundle  (auto-loaded by @sentry/nextjs)
sentry.edge.config.ts     ← Edge runtime    (middleware + edge handlers; minimal — no Replay)
src/lib/sentry/config.ts  ← shared loader; returns null when DSN absent
src/lib/sentry/scrubber.ts← beforeSend / beforeSendTransaction PII strip
src/lib/sentry/sampler.ts ← dynamic trace sampler (checkout routes get 25 %)
src/lib/sentry/capture.ts ← captureServerError() / captureServerMessage() helpers
```

The three init files share `loadSentryConfig()` and `scrubSentryEvent()`
intentionally — keeping them in sync prevents the "client bundle
silently leaks PII because someone updated only the server scrubber"
class of bug.

## How to investigate an error in Sentry UI

When a buyer reports a problem and gives you a `Trace: <id>` from the
500 page, paste that id straight into Sentry's search to jump to the
event. Otherwise, narrow with the filters below.

### Tags shipped on every server event

Set by [`captureServerError()`](../../src/lib/sentry/capture.ts) when the
caller passes context:

| Tag | Source | Filter syntax |
|---|---|---|
| `correlationId` | per-request ALS ([`src/lib/correlation-context.ts`](../../src/lib/correlation-context.ts), seeded by [`src/proxy.ts`](../../src/proxy.ts)) | `correlationId:<id>` |
| `checkoutAttemptId` | checkout idempotency token | `checkoutAttemptId:<uuid>` |
| `domain.scope` | log scope (`checkout.*`, `stripe.webhook.*`, etc.) | `domain.scope:checkout.*` |
| `release` | git SHA injected at build | `release:<sha7>` |
| `environment` | `APP_ENV` (post-#1094) | `environment:production` |
| `user.id` | opaque internal id only — never email/username/IP | `user.id:<uuid>` |

The PII scrubber strips email, username and ip_address from `user`
even if a caller accidentally sets them — see scrubber test suite.

### Recommended saved searches

Create these in Sentry → Issues → Saved Searches so the oncall has them
one click away:

- **Production checkout errors** — `environment:production domain.scope:checkout.*`
- **Production webhook errors** — `environment:production domain.scope:stripe.webhook.*`
- **Staging only** — `environment:staging` (catch issues before prod)
- **This release** — `release:<current-SHA>` (regression hunt after a deploy)

### How `correlationId` is wired (post-#1210)

1. [`src/proxy.ts`](../../src/proxy.ts) (Next.js 16's renamed middleware)
   generates (or accepts an inbound, validated) `x-correlation-id` per
   request and writes it to both the rewritten request headers and the
   response headers. Browsers and support tools see the same id in
   `curl -i`.
2. The root layout reads it via `headers()` and injects
   `<meta name="x-correlation-id" content="...">` so client components
   (notably [`error.tsx`](../../src/app/error.tsx)) can surface it as
   `Request ID: <id>` on the 500 page.
3. Server entry points that opt in via
   [`runWithCorrelation()`](../../src/lib/correlation-context.ts) put the
   id in an `AsyncLocalStorage`. From that point on, **`logger.*` and the
   Sentry mirror auto-tag every event** with the ambient id — no need to
   pass `correlationId` through every layer. Explicit
   `context.correlationId` still wins (e.g. webhook handlers using a
   per-event id distinct from the per-request id).

### Pivot from Sentry to logs

Every Sentry event tagged with `correlationId` corresponds to one or
more log lines. To pivot:

1. Copy `correlationId` from the Sentry event detail.
2. Grep production logs (or whatever log aggregator is wired) for
   `correlationId="<uuid>"`. You will see the full request lifecycle:
   `checkout.start` → `checkout.committed` → `stripe.webhook.received`
   etc.
3. Cross-reference with the `domain.scope` table in
   [`payment-incidents.md`](payment-incidents.md) for what each scope means.

## PII scrubber

### What it does

`scrubSentryEvent()` runs as the `beforeSend` (and
`beforeSendTransaction`) hook on every Sentry init. It deep-walks the
event payload and uses the **shared scrubber** ([`src/lib/scrubber.ts`](../../src/lib/scrubber.ts)) so logger and Sentry can never drift apart again (#1354).

| Class | Keys (case-insensitive substring) | Values (anywhere in any string) |
|-------|-----------------------------------|---------------------------------|
| Auth / sessions | `password`, `token`, `cookie`, `authorization`, `session`, `secret`, `apikey`, `client_secret`, `webhook_secret` | JWT-shaped `a.b.c` triplets, Stripe-style `sk_/pk_/pi_/cs_/whsec_/...` tokens |
| Payments | `cardnumber`, `cvv`, `cvc`, `iban`, `bic`, `swift` | `\b[A-Z]{2}\d{2}[A-Z0-9]{8,30}\b` (IBAN value) |
| Identity | `email`, `correo`, `phone`, `telefono`, `dni`, `nie` | E-mail regex; ES DNI/NIE `\b[XYZ]?\d{7,8}[A-Z]\b`; ES phone `\b(?:\+34\s?)?[6-9]\d{8}\b`; permissive separator-rich phone |
| Geo | `address`, `direccion`, `postalcode`, `cp` | (none — values handled at key level) |

The Sentry layer additionally:

- Strips `user` to `{ id }` only — drops email, username, ip_address.
- Drops `cookies` entirely (even non-session ones — they can still identify a buyer).
- Allow-lists request headers: keeps `user-agent`, `accept`, `accept-language`, `x-forwarded-proto`, `x-vercel-id`, `x-correlation-id`. Everything else (including `authorization`, `cookie`, custom `x-*-secret`) is dropped.
- Returns `null` (drops the event) if the scrubber itself crashes — a missing event is a better failure mode than a leaked one.
- Logs to **stderr** (not via `logger`, to avoid re-entrant Sentry capture) when scrubbing crashes, so operators see the dead-zone.

Source: [`src/lib/sentry/scrubber.ts`](../../src/lib/sentry/scrubber.ts) (event-shape walker) + [`src/lib/scrubber.ts`](../../src/lib/scrubber.ts) (shared patterns + `scrubString` / `scrubPayload`). The header comment in both files is the authoritative spec.

### The contract: every pattern needs a test

> Every new pattern added to `src/lib/scrubber.ts` MUST come with a test
> in `test/features/scrubber.test.ts` proving the PII class is caught.
> The same suite enforces logger ≡ Sentry parity, so adding a regex to
> one and forgetting the other trips a test. PII leak via either sink
> is a GDPR exposure.

This is enforced socially in [`AGENTS.md`](../../AGENTS.md) §
Conventions → "Sentry error tracking". There is no audit script for it
— code review catches it. The motivating reason: a regression in the
scrubber is a class of bug we cannot detect from logs (the leaked PII
is, by definition, not in our system anymore — it's in Sentry's). The
test suite is the only line of defence.

### How to add a new scrubber rule

Always TDD — write the failing test first, then the regex.

1. **Write the test first.** Open
   [`test/features/sentry-scrubber.test.ts`](../../test/features/sentry-scrubber.test.ts).
   Pick the right section:
   - Key-based redaction (matches a field name) → `scrubPayload redacts keys matching ...`
   - Value-based pattern (matches a value anywhere) → `scrubPayload strips ... inside strings`
   - Event-shape redaction → `scrubSentryEvent ...` block
2. Add a test that names the PII class explicitly and asserts the
   output contains `[redacted]` (or whatever the expected behaviour is).
3. Run the suite — it should fail:
   ```bash
   npm run test -- test/features/sentry-scrubber.test.ts
   ```
4. **Implement the rule** in `src/lib/sentry/scrubber.ts`:
   - For a new key → add the keyword to `REDACT_KEY_PATTERN`.
   - For a new value pattern → add a `*_PATTERN` regex and a `.replace()`
     call inside `scrubString()`.
   - For an event-shape transform (new sub-object Sentry adds) → extend
     `scrubSentryEvent()` directly.
5. Run the suite again — it should pass:
   ```bash
   npm run test -- test/features/sentry-scrubber.test.ts
   ```
6. Run the full test suite to confirm nothing else regressed:
   ```bash
   npm run test
   ```
7. Commit with `feat(sentry): scrub <PII class>` (or `fix(sentry): ...`
   if responding to a leak — see Scenario 4 below).

### What's already scrubbed today

| Class | Caught by | Test coverage |
|---|---|---|
| Field-name PII (password, token, secret, email, phone, address, postal code, IBAN, card, CVV) | `REDACT_KEY_PATTERN` | `scrubPayload redacts keys matching ...` |
| Email addresses inside any string | `EMAIL_PATTERN` | `scrubPayload strips emails inside free-text strings` |
| Phone numbers inside strings (intl format, 6–15 digits) | `PHONE_PATTERN` | `scrubPayload strips phone numbers inside strings` |
| Stripe-style tokens (`pi_`, `ch_`, `cs_`, `sk_`, `pk_`, `evt_`, `in_`, `sub_`, `cus_`, `seti_`, `pm_`) | `STRIPE_TOKEN_PATTERN` | `scrubPayload strips Stripe-style tokens anywhere` |
| JWT-like long bearer tokens | `LONG_TOKEN_PATTERN` | `scrubPayload strips JWT-like long tokens` |
| Sentry `user` → keep only `{ id }` | `scrubSentryEvent` | `scrubSentryEvent strips user to {id} only` |
| Cookies (all of them) | `scrubRequest` | `scrubSentryEvent drops cookies entirely` |
| Request headers (allow-list only) | `scrubRequest` | `scrubSentryEvent allow-lists only safe headers` |
| Cyclic objects in extras | `WeakSet` visited tracker | `scrubPayload survives cycles without stack overflow` |
| Scrubber crash → drop event | catch-all in `scrubSentryEvent` | `scrubSentryEvent drops the event ... if scrubbing itself throws` |

## Scenarios

### Scenario 1: a new error pattern appeared in production

```
1. Sort the Issues view by "Last seen" or "First seen" within
   environment:production. Filter to release:<current-SHA> if you
   suspect a recent deploy.

2. Open the top issue. Capture:
   - The `correlationId` tag.
   - The `domain.scope` tag — tells you which subsystem owns it.
   - The release SHA — so you can git-blame the change window.
   - The first / last seen timestamps — frequency hint.

3. Pivot to logs by correlationId. Read every line in that request's
   lifecycle. Match the scope to the table in
   `docs/runbooks/payment-incidents.md` (for checkout / Stripe) or to
   the structured log scopes the owning subsystem documents.

4. Reproduce locally if possible. The release tag tells you the exact
   commit. `git checkout <SHA> && npm run dev` then replay the steps
   from the breadcrumbs.

5. Decide:
   - Real bug → open an issue, link the Sentry event URL, set
     `correlationId` + scope in the issue body for the fixer.
   - Known third-party noise → add to `ignoreErrors` in the relevant
     `sentry.*.config.ts` (and document why in the same commit).
   - PII leak → jump to Scenario 4.
```

### Scenario 2: Sentry shows zero events for 24h

This is almost always a configuration problem, not a "we got lucky"
moment. Check in this order:

```
1. Did the DSN env var disappear?
     - Server: $SENTRY_DSN set in the deploy environment?
     - Client: $NEXT_PUBLIC_SENTRY_DSN set at BUILD time? Webpack
       inlines NEXT_PUBLIC_* during build — a runtime change is too
       late, you need a fresh build.

2. Did sample rates drop to 0?
     - SENTRY_TRACES_SAMPLE_RATE — affects performance only, not errors.
     - Errors are NOT sampled. If errors are missing it's a DSN /
       transport problem, not a sample-rate one.

3. Is the scrubber crashing on every event?
     - Look for `[sentry-scrubber] crashed — dropping event` in stderr
       (server logs). When that line repeats, every error is being
       silently dropped at the scrubber level.
     - Tail logs: `docker logs marketplace 2>&1 | grep sentry-scrubber`.
     - Triage by reading the captured `error` field — the fix is to
       harden the scrubber, never to remove the catch-all.

4. Is the SDK initialised at all?
     - `loadSentryConfig()` returns null in NODE_ENV=test. If
       NODE_ENV leaked to a non-test runtime, init silently no-ops.
     - Check by adding a one-off `Sentry.captureMessage('probe')` at
       boot and watching whether it lands.
```

### Scenario 3: an error has `correlationId` but no `domain.scope`

This means the error was captured by something that called
`captureServerError()` without passing a `scope` (or by an unhandled
exception that the SDK auto-captured outside any structured handler).
You can still investigate the error, but you cannot filter by domain
in Sentry, and the issue groups by stack trace instead of by scope.

```
1. Investigate the error normally — pivot to logs by correlationId.

2. After the fix, add the scope:
     - If the error was thrown from a server action / route handler:
       wrap the catch with captureServerError(err, { correlationId,
       scope: 'subsystem.event' }).
     - If the error came from a structured logger.error() call: make
       sure the scope is the first argument so the Sentry capture
       picks it up automatically (logger pushes scope as a tag on
       structured calls — see src/lib/logger.ts).

3. The scope should follow the `subsystem.action[.detail]` convention
   already in payment-incidents.md (e.g. `checkout.committed`,
   `stripe.webhook.invalid_payload`). Never bracketed tags
   (`[checkout][error]`) — the log audit / regression suite pins
   dotted scopes.
```

### Scenario 4: PII leaked into a Sentry payload

**This is a GDPR-class incident.** Treat it with payment-mismatch-level
urgency.

```
1. STOP the leak immediately:
     - Identify the PII class (email? phone? card? auth token?).
     - If it's actively reaching Sentry: the scrubber is missing a
       pattern. Skip to step 3.
     - If a recent deploy introduced it: roll back the deploy or push
       a hotfix that removes the offending log/payload field. The
       scrubber is a safety net; the *fix* is to stop putting PII in
       Sentry-bound fields in the first place.

2. Triage what already leaked:
     - Filter Sentry by the affected time window + payload signature.
     - Note the count of events and the kinds of users affected.
     - Document for the GDPR record (paper trail, even if no users
       harmed in practice).

3. Add the scrubber rule (Scenario "How to add a new scrubber rule"
   above):
     - Test FIRST asserting the new PII class is caught.
     - Implement the regex / key match.
     - Run `npm run test` — green.
     - Open a PR titled `fix(sentry): scrub <PII class>` referencing
       the incident. Land it ASAP — this is the kind of PR where
       auto-merge with --squash --delete-branch is the right call.

4. Redeploy. The scrubber runs in beforeSend, so the fix takes effect
   for new events the moment the new build boots. Already-stored
   events stay leaked unless you also delete them via Sentry's
   data-removal API.

5. Post-incident:
     - If the leaked field came from a logger call, add a regression
       test in test/features/structured-log-events.test.ts that proves
       the field name is no longer in the payload.
     - If it came from a Prisma error message: consider whether the
       scrubber needs a Prisma-error-shape rule.
     - Update this runbook's "What's already scrubbed today" table.
```

## Alerting

### What's alerted today

The Sentry side of alerting is configured **in the Sentry UI**. The
machine-readable mirror lives in [`infra/sentry-alerts.yaml`](../../infra/sentry-alerts.yaml)
— that file is the contract that pins which rules MUST exist; the
quarterly canary procedure below proves they actually fire.

To audit what's alerted today: Sentry → Alerts → Alerts list. Cross-
reference with the on-call channel (Telegram in the same channel as
payments — see [`payment-incidents.md`](payment-incidents.md)).

### P0 alert set (#1212)

These ten alerts are the minimum viable on-call surface for the
launch. Two are external (Healthchecks.io for `/api/ready`, PostHog
for the buyer-funnel insight) — listed here so the on-call surface
stays auditable from a single file.

| # | Rule (`infra/sentry-alerts.yaml::name`) | Source | Condition | Channel |
|---|---|---|---|---|
| 1 | `5xx-rate-global` | Sentry | error rate > 1% / 5 min | oncall |
| 2 | `5xx-stripe-webhook` | Sentry | any 5xx in `POST /api/webhooks/stripe` / 5 min | oncall |
| 3 | `payment-mismatch-any` | Sentry | `domain.scope:stripe.webhook.payment_mismatch` ANY event | security + oncall |
| 4 | `ready-probe-failed` | Healthchecks.io | `/api/ready` fails 3 consecutive probes | oncall |
| 5 | `auth-signin-failed-burst` | Sentry | `domain.scope:auth.signin.failed` > 30 / min | oncall |
| 6 | `oauth-callback-error-rate` | Sentry | OAuth callback error rate > 10% / 5 min | oncall |
| 7 | `checkout-funnel-collapse` | PostHog | conversion drops < 50% of trailing-14d baseline / 30 min | oncall |
| 8 | `dlq-pending-or-spike` | Sentry | `domain.scope:queue.dlq.entry` ≥ 3 / 24 h | oncall |
| 9 | `db-connection-error-burst` | Sentry | Postgres connect-refused > 5 / min | oncall |
| 10 | `ratelimit-degraded-fail-closed` | Sentry | `ratelimit.degraded` with `fail_mode:closed` ANY event | oncall |

The previous "recommended alerts" set (looser thresholds — checkout
error spike `> 10 / 5 min`, webhook errors `> 3 / 15 min`, etc.)
lives in git history and is still useful as supplementary daytime
alerts. Add them below the P0 set in the UI; they don't go on this
table because they don't page on-call.

### Alerts armed

Cronological log of when each rule was confirmed live in the Sentry
UI. Update in the same PR that arms or changes a rule.

| Date       | Rule                              | Operator | Notes |
|------------|-----------------------------------|----------|-------|
| YYYY-MM-DD | `5xx-rate-global`                 | TODO     | Initial arm — fill after first canary |
| YYYY-MM-DD | `5xx-stripe-webhook`              | TODO     | |
| YYYY-MM-DD | `payment-mismatch-any`            | TODO     | |
| YYYY-MM-DD | `ready-probe-failed`              | TODO     | Healthchecks.io check, NOT a Sentry rule |
| YYYY-MM-DD | `auth-signin-failed-burst`        | TODO     | |
| YYYY-MM-DD | `oauth-callback-error-rate`       | TODO     | |
| YYYY-MM-DD | `checkout-funnel-collapse`        | TODO     | PostHog funnel insight, NOT a Sentry rule |
| YYYY-MM-DD | `dlq-pending-or-spike`            | TODO     | |
| YYYY-MM-DD | `db-connection-error-burst`       | TODO     | |
| YYYY-MM-DD | `ratelimit-degraded-fail-closed`  | TODO     | |

### Canary procedure (quarterly)

[`scripts/sentry-canary.sh staging`](../../scripts/sentry-canary.sh)
fires one synthetic event per rule listed in `infra/sentry-alerts.yaml`
so the operator can confirm end-to-end delivery in the configured
Telegram channels.

Cadence: **first Monday of every quarter**, against staging.
Production canaries are incident-style: post a "running canary in 5
min" in the on-call channel first, then
`I_KNOW_THIS_PAGES_ONCALL=yes bash scripts/sentry-canary.sh production`.
The script refuses to run against production without that env var.

After every canary:

1. Tick the matching row in the **Alerts armed** table above with
   today's date and your handle.
2. Any rule that did NOT fire: open Sentry → Alerts → that rule and
   compare the conditions to the canary event's tags. Update both
   `infra/sentry-alerts.yaml` AND the UI in the same change.
3. Drop a one-liner in [`docs/state-of-the-world.md`](../state-of-the-world.md)
   § "Recent ops work" so other agents see the canary ran.

The canary events carry `canary:1` and `canary.rule:<name>` tags;
filter them out of any "first-seen" dashboards with `!canary:1`.

### Cross-reference with PostHog

PostHog dashboards cover **expected** events with structured scopes
(`buyer.cart.add`, `notifications.handler.skipped`, etc.). Sentry covers
**unexpected** errors (uncaught exceptions, transport failures). They
overlap on `domain.scope:*.failed` events — wire each alert in only one
channel to avoid double-paging.

See [`docs/posthog-dashboards.md`](../posthog-dashboards.md) for the
expected-event side. The "Notification Health" dashboard (PR 3A of the
post-2026-05-03 audit) covers the notification subsystem.

## Operational tips

- **Releases need a fresh build to update.** `NEXT_PUBLIC_COMMIT_SHA` is
  inlined by webpack at build time. Bumping the env var without
  rebuilding does nothing on the client.
- **Source maps.** `@sentry/nextjs` uploads source maps automatically on
  `next build` when the auth token is configured. If stack traces are
  minified-only in Sentry, the upload step failed at deploy — check the
  build logs for `sentry-cli` errors.
- **Ignore lists are local.** `ignoreErrors` and `denyUrls` live in the
  three `sentry.*.config.ts` files. Update all three when adding a new
  always-ignore pattern that applies cross-runtime.
- **Edge runtime is leaner.** No Replay, no `tracesSampler` (only a flat
  rate). If you need a feature in edge, check
  [Sentry's edge support matrix](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#configure-server-side-sentry-sdk-with-an-edge-runtime)
  before assuming it works.

## See also

- [`src/lib/sentry/scrubber.ts`](../../src/lib/sentry/scrubber.ts) — authoritative scrubber spec (header comment + code).
- [`test/features/sentry-scrubber.test.ts`](../../test/features/sentry-scrubber.test.ts) — the contract that pins which PII classes the scrubber catches.
- [`src/lib/sentry/capture.ts`](../../src/lib/sentry/capture.ts) — `captureServerError` / `captureServerMessage` helpers (these are what set `correlationId`, `domain.scope`, `user.id` tags).
- [`src/lib/sentry/sampler.ts`](../../src/lib/sentry/sampler.ts) — dynamic trace sampling (checkout routes get 25 %).
- [`docs/runbooks/payment-incidents.md`](payment-incidents.md) — Step 0 invokes Sentry first; this runbook is the inverse direction.
- [`docs/conventions.md`](../conventions.md) — server-action + structured-logger patterns. Logger scopes are what become `domain.scope` tags in Sentry.
- [`src/lib/correlation.ts`](../../src/lib/correlation.ts) — correlation ID generator. Same id flows into logs + Sentry tags + the 500-page `Trace:` field.
- [`AGENTS.md`](../../AGENTS.md) § Conventions → Sentry — the one-liner contract that points back here.

## When adding a new Sentry capture site

1. Always pass `correlationId` (from request scope) and `scope` (the
   matching `domain.action` log scope) to `captureServerError()`. Without
   them the event is hard to investigate (no log pivot, no group).
2. Never pass user email, phone, or full address to `setUser()` —
   `{ id: <uuid> }` only. The scrubber would catch it, but defence in
   depth is cheap.
3. If you're adding a brand-new `domain.scope`, add it to the
   payment-incidents.md scope table (or its successor for non-payment
   domains) and to `test/features/structured-log-events.test.ts` so the
   scope name becomes a pinned contract.
