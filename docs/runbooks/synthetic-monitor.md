---
summary: Synthetic-checkout endpoint (#1223) — token-gated POST that creates a synthetic Order against the dedicated synthetic vendor/product. The external cron drives Stripe test-mode and asserts the webhook lands the row in PAYMENT_CONFIRMED.
audience: ops + on-call
read_when: provisioning the synthetic monitor for the first time, debugging a false-positive alert, retiring the monitor
---

# Synthetic checkout monitor (#1223)

## Why
The PostHog funnel detects checkout regressions vs baseline, but it requires real traffic. In the first week post-launch (and every quiet stretch after), there is no signal. A synthetic checkout every 10 minutes — Stripe test-mode, dedicated synthetic product — guarantees the critical path stays alive: auth → cart → checkout → webhook → Order PAYMENT_CONFIRMED.

## Architecture

| Piece | Lives in | Owner |
|-------|----------|-------|
| Synthetic User / Vendor / Product seed | `src/domains/synthetic-monitor/seed.ts` (idempotent) | code |
| Endpoint `POST /api/test-checkout/start` | `src/app/api/test-checkout/start/route.ts` | code |
| Public catalog filter (`synthetic: false`) | `src/domains/catalog/availability.ts` + `getVendorsUncached` | code |
| Order purge after 24 h | `src/workers/jobs/cleanup-abandoned.ts` (extension) | code |
| External cron that drives the endpoint + Stripe test card | external monitor service (BetterStack / Healthchecks / GitHub Actions cron) | **ops** |

Code is inert until ops provisions `SYNTHETIC_TOKEN` in `.env.production`. The endpoint returns 503 in that state — the external cron's first probe alerts the team that the monitor isn't wired yet, which is the right failure mode (we want to know).

## How to provision

1. **Generate a token.** Use a 32+ char random string. Bitwarden vault entry "raizdirecta synthetic monitor".
2. **Set the env var on the prod app container:**

   ```bash
   sudo install -d -m 700 /etc/raizdirecta
   echo 'SYNTHETIC_TOKEN=<the random token>' | sudo tee -a /etc/raizdirecta/app.env
   sudo systemctl restart raizdirecta-app   # or `npm run deploy:prod` for full rebuild
   ```

3. **Smoke the endpoint.**

   ```bash
   curl -s -X POST https://raizdirecta.es/api/test-checkout/start \
     -H "Authorization: Bearer $SYNTHETIC_TOKEN" \
     -H 'content-type: application/json' \
     -d '{}'
   # → 201 + JSON { orderId, orderNumber: "SYN-…", status: "PLACED" }
   ```

4. **Configure the external cron.** The cron's job is to:
   - `POST /api/test-checkout/start` with the bearer.
   - Pull the resulting `orderId` and (separate endpoint, future) the PaymentIntent client secret.
   - Confirm the PaymentIntent against the Stripe test card `4242 4242 4242 4242`.
   - Poll `GET /api/admin/orders/<orderId>` (or a dedicated read endpoint) for `paymentStatus === 'SUCCEEDED'` within 30 s.
   - On timeout / non-2xx → page Telegram.

   Recommendations: GitHub Actions `schedule: '*/10 * * * *'` is the simplest path; BetterStack / Healthchecks "Heartbeat with HTTP body assertion" works too.

## SOP — alert fires

1. Hit the endpoint manually (step 3 above) to confirm whether the failure is the endpoint itself or the downstream Stripe path.
2. If 503: ops never provisioned `SYNTHETIC_TOKEN`, or it got rotated and the cron has the old one.
3. If 401: token mismatch — rotate the cron secret to match `/etc/raizdirecta/app.env`.
4. If 5xx: open `/admin/audit?actorId=system&entityType=Order` to see whether the Order row landed; cross-check `synthetic.checkout.failed` log scope.
5. If 201 but the cron still alerts → the issue is post-Order (Stripe test-mode connectivity, webhook lag). Check `stripe.webhook.received` log scope and the WebhookDelivery rows.

## Lifecycle

- Synthetic Orders accumulate in the DB until the nightly `cleanup.abandoned` worker job (`30 4 * * *` UTC) purges any synthetic row > 24 h old. The job deletes the Order, its OrderLines, any Payments / Refunds — but NEVER touches a non-synthetic order, even at 30 days old (test contract: `test/integration/synthetic-checkout.test.ts`).
- The synthetic vendor / product / customer rows persist forever — they're upserted on every endpoint call and intentionally never cleaned up. Removing them would just waste a re-seed on the next probe.

## Polución de métricas

Filter `synthetic = true` in every dashboard / analytics query that aggregates Orders. Existing public-catalog filters (`getAvailableProductWhere`, `getVendorsUncached`) already exclude the synthetic rows. Admin dashboards may show them — that's intentional, the operator wants to see if the synthetic path is healthy.

## Out of scope (#1223 follow-ups)

- An admin-facing read endpoint that returns the synthetic Order's PaymentIntent client secret. Until that lands, the cron cannot complete the Stripe payment step.
- A `synthetic.checkout.duration_ms` PostHog metric. The structured `synthetic.checkout.created` log + the cleanup counters are enough for v1.
