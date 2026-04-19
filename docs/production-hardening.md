# Production hardening — Stripe mode cutover

Concrete pre-flight checklist before flipping `PAYMENT_PROVIDER=stripe` in production. Every item here ties to existing code and runbooks; generic SaaS advice is deliberately excluded.

## 1. Environment variables

Required (validated at boot in [`src/lib/env.ts`](../src/lib/env.ts)):

- [ ] `DATABASE_URL` — production Postgres. Must be the same instance the migrations were applied against.
- [ ] `AUTH_SECRET` — 32+ random bytes. Rotated via staged deploy: set the new value alongside the old (NextAuth only reads one at a time), restart, remove the old.
- [ ] `PAYMENT_PROVIDER=stripe`
- [ ] `STRIPE_SECRET_KEY` — live mode `sk_live_...`. Never commit. Stored in Vercel (or equivalent) secret store.
- [ ] `STRIPE_WEBHOOK_SECRET` — from the Stripe dashboard webhook endpoint config.
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — live `pk_live_...`.
- [ ] `NEXT_PUBLIC_APP_URL` — canonical public origin (for OAuth callbacks and Stripe redirects).
- [ ] `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` — see [`docs/runbooks/payment-incidents.md`](runbooks/payment-incidents.md) §Step 0.

Env zod schema will fail the server startup if any Stripe-required var is missing when `PAYMENT_PROVIDER=stripe` — [`src/lib/env.ts:42`](../src/lib/env.ts#L42). **Do not bypass this check.**

### Secret rotation

1. Generate new value in the secret manager.
2. Deploy with BOTH old and new (NextAuth / Stripe accept either, depending on the secret).
3. Wait 1 deployment cycle for in-flight sessions / webhooks to drain.
4. Remove the old value.

## 2. Stripe dashboard setup

- [ ] Webhook endpoint: `https://<app>/api/webhooks/stripe`
- [ ] Subscribed events (at minimum):
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `customer.subscription.created` / `updated` / `deleted`
  - `invoice.paid` / `invoice.payment_failed`
- [ ] Signing secret copied into `STRIPE_WEBHOOK_SECRET`.
- [ ] Test event delivered successfully (dashboard → "Send test webhook") — check app logs for `stripe.webhook.received`.
- [ ] **Connect** accounts onboarded for every production vendor (Express). Single-vendor orders use `transfer_data.destination`; multi-vendor orders rely on the settlement system.

## 3. Deployment gates (already automated)

Before a Stripe-mode deploy is considered safe:

- [ ] PR passes `Doctor (schema + routes + healthcheck)` — covers migrate-deploy + seeded DB + authenticated post-middleware probes (#525, #526).
- [ ] PR passes `Build And Migrate` — includes `prisma migrate diff --exit-code` against the migrations directory (#313). A schema field added without a migration fails this gate.
- [ ] `E2E Smoke` green — exercises `cart-checkout.spec.ts`.
- [ ] Sentry release tag landed (`NEXT_PUBLIC_COMMIT_SHA` / `VERCEL_GIT_COMMIT_SHA` set) so stack frames resolve in alerts.

See [`docs/branch-protection.md`](branch-protection.md) for the full required-check list.

## 4. Idempotency & replay

The webhook is idempotent by construction — [`src/app/api/webhooks/stripe/route.ts:105`](../src/app/api/webhooks/stripe/route.ts#L105) inserts a `WebhookDelivery` row with `@@unique([provider, eventId])` before any handler runs. Duplicate Stripe deliveries short-circuit as `stripe.webhook.duplicate`.

- [ ] Verify `WebhookDelivery` and `WebhookDeadLetter` tables exist in prod DB (created by migration `20260315140000_webhook_delivery_model` or later).
- [ ] Manual replay path documented: [`docs/runbooks/payment-incidents.md` §"Manual replay flow"](runbooks/payment-incidents.md#manual-replay-flow).

## 5. Alert thresholds

Configure in your alert platform (see [`docs/runbooks/payment-incidents.md` §"Alert thresholds"](runbooks/payment-incidents.md#alert-thresholds)). At minimum:

- [ ] `stripe.webhook.payment_mismatch` — **pages oncall immediately**. Potential fraud / tampering.
- [ ] `stripe.webhook.retry_exhausted` — page after 3 in 15 minutes.
- [ ] `stripe.webhook.dead_letter_record_failed` — page immediately. DLQ itself is failing.
- [ ] `checkout.payment_intent_failed` or `checkout.stripe_intent_create_failed` — ticket after burst above baseline.
- [ ] Sentry: any unhandled in `src/domains/payments/**` or `src/app/api/webhooks/**` → page.

## 6. Rollback

If a Stripe-mode deploy misbehaves:

1. Do NOT flip back to `PAYMENT_PROVIDER=mock` in production — mock creates its own provider refs that will not match any real Stripe objects. You will orphan everything in-flight.
2. Roll back the app commit (Vercel "Instant Rollback" or `vercel rollback`).
3. If a migration shipped, roll back with `prisma migrate resolve --rolled-back <migration>` then `prisma migrate deploy` to the previous state — never `prisma db push --force-reset`.
4. Open an incident ticket, link the `correlationId` of the first affected checkout, follow [`docs/runbooks/payment-incidents.md`](runbooks/payment-incidents.md).

## 7. Staging verification — before live cutover

Run each in order against staging with live-mode test keys:

- [ ] Single-vendor checkout → Stripe test card `4242 4242 4242 4242` → confirm Order `PAYMENT_CONFIRMED`, vendor Express account received transfer minus fee.
- [ ] Multi-vendor checkout → same card → confirm Order `PAYMENT_CONFIRMED`, settlement pipeline picks it up (funds stay on platform).
- [ ] Card decline path → `4000 0000 0000 0002` → confirm Payment `FAILED`, Order `paymentStatus=FAILED`, buyer sees friendly retry message.
- [ ] Webhook retry path → manually 500 the endpoint (or use Stripe's "Resend" button) → confirm idempotent: no duplicate Order confirmation, no duplicate `OrderEvent`.
- [ ] Amount mismatch path → simulate by editing `Payment.amount` in staging and replaying the event → confirm `stripe.webhook.payment_mismatch` fires and handler does **not** confirm the order.
- [ ] Subscription creation → confirm subscription flows through `customer.subscription.created` and plan lookup succeeds.

## 8. Post-cutover

- [ ] Watch `stripe.webhook.received` / `.retry_exhausted` / `.payment_mismatch` dashboards for 24h.
- [ ] Run the orphan-PI reconciliation script (once the script from #405 lands) after the first 24h.
- [ ] Review Sentry errors scoped to `payments` / `stripe.webhook` for unexpected patterns.
- [ ] If quiet for a week, remove `PAYMENT_PROVIDER=mock` as an option from dev docs that assume it's the default in staging.
