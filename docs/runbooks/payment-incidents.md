---
summary: Recetas para investigar reports de pago: scopes checkout.* y stripe.webhook.* en logs/PostHog. NO renombrar sin actualizar este doc.
audience: agents,humans
read_when: investigar pago fallido, webhook de Stripe, dispute, captura
---

# Payment incidents runbook

Practical recipes for investigating payment-related reports from buyers:
phantom charges, orders without payments, double charges, stuck
`PAYMENT_PENDING`, amount mismatches. Every step here assumes the
structured-logging conventions shipped in #414 (`checkout.*`) and
#415 (`stripe.webhook.*`).

## Before you start

Collect from the user:

- **Order number** (shown in buyer's cart/email — e.g. `MP-20260416-ABCD`)
- **Error ID** shown on the 500 page (a digest) and/or the **Trace** field (Sentry event id)
- **Time window** (when they tried to pay — UTC preferred but local is OK)
- **Stripe dashboard access** if you're investigating real-Stripe mode
- **Provider** — are they on `mock` or `stripe`? Check `PAYMENT_PROVIDER` env

### Step 0 — always look at Sentry first (#523)

When `SENTRY_DSN` is configured, every unhandled server or client error
appears in the Sentry project within seconds, with:

- Stack trace (mapped to source if source maps were uploaded at build)
- `correlationId` tag → pivot to logs
- `userId` tag (opaque id only, no email)
- `domain.scope` tag (`checkout.*`, `stripe.webhook.*`, etc.)
- Release (git SHA) — filter by deploy

If the buyer gives you the `Trace: <id>` from the error page, paste it
into Sentry's search to jump straight to the event. Sentry then tells
you the `correlationId` → grep the logs with it per scenarios below.

## Log query index

### Checkout events (from orders use-cases)

| Scope | What it means |
|---|---|
| `checkout.start` | Attempt started. Includes `correlationId`, `userId`, `itemCount`. |
| `checkout.committed` | Order + Payment rows created. Includes `orderId`, `orderNumber`, `providerRef`, `grandTotalCents`. |
| `checkout.address_fallback` | Saved address not found — fell back to submitted payload. |
| `checkout.address_save_failed` | `tx.address.create` threw. Checkout continued. |
| `checkout.payment_intent_failed` | Payment provider threw. Placeholder Payment row marked FAILED. |
| `checkout.payment_mark_failed` | FAILED-marking itself failed after provider error. Requires manual cleanup. |
| `checkout.payment_row_mismatch` | Linked ≠ 1 unlinked PENDING rows. Defensive — investigate immediately. |
| `checkout.mock_confirmation_failed` | Order created but mock `confirmOrder` threw. Row will stay `PAYMENT_PENDING`. |
| `checkout.tx_failed` | Outer error path in `createCheckoutOrder`. Transaction rolled back. |
| `checkout.confirm_amount_mismatch` | `confirmOrder` found Payment.amount ≠ Order.grandTotal. Never confirm. Alert on. |

### Stripe webhook events (from `api/webhooks/stripe/route.ts`)

| Scope | What it means |
|---|---|
| `stripe.webhook.received` | New event arrived. Includes `eventId`, `eventType`, `provider`. |
| `stripe.webhook.duplicate` | `(provider, eventId)` already in `WebhookDelivery`. Skipped. |
| `stripe.webhook.invalid_payload` | Stripe object didn't match expected schema. Event dropped silently. |
| `stripe.webhook.delivery_insert_failed` | DB error writing `WebhookDelivery`. Handler ran anyway (fail-open). |
| `stripe.webhook.delivery_update_failed` | Couldn't update `WebhookDelivery.status`. Row state divergent. |
| `stripe.webhook.processing_failed` | Handler threw. 500 returned — Stripe will retry. |
| `stripe.webhook.payment_mismatch` | Stripe amount ≠ stored Payment amount. **Security alert.** |
| `stripe.webhook.subscription_created_missing_metadata` | `customer.subscription.created` without our buyerId/planId metadata. |
| `stripe.webhook.subscription_created_plan_missing` | Plan not in DB or archived. Stripe sub now orphaned. |
| `stripe.webhook.subscription_created_address_missing` | Shipping address belongs to different buyer or deleted. |
| `stripe.webhook.subscription_not_found` | Stripe event for a subscription we don't know about. Expected during the 4b-α transition. |
| `stripe.webhook.subscription_sync_stale` | Out-of-order event dropped via `lastStripeEventAt` watermark. |
| `stripe.webhook.invoice_paid_subscription_not_found` | Invoice arrived before the `subscription.created`. Stripe will retry. |
| `stripe.webhook.invoice_paid_stale` | Out-of-order invoice dropped. |
| `stripe.webhook.invoice_payment_failed_stale` | Out-of-order invoice.failed dropped. |
| `stripe.webhook.dead_letter_record_failed` | DLQ row couldn't be written. On-call emergency. |
| `stripe.webhook.retry` | Transient DB/network failure inside a webhook handler step — backing off and retrying (attempt N of M). Emitted from `src/domains/payments/webhook.ts`. |
| `stripe.webhook.retry_exhausted` | All retries failed. The handler then throws → Stripe sees 500 and will redeliver. Investigate the `operation` field to know which step (`insertWebhookDelivery`, `confirmOrder`, etc.). |

### Payment-provider events (from `src/domains/payments/provider.ts`)

| Scope | What it means |
|---|---|
| `checkout.stripe_intent_create_failed` | `stripe.paymentIntents.create()` threw. Retries up to 2 times internally. Context carries `orderId`, `correlationId`, `amountCents`, `attempt`, `connectDestination`. Correlate to [`checkout.payment_intent_failed`](#checkout-events-from-createorder--createcheckoutorder) upstream — same incident, caller's view. |

## Scenario 1: buyer says "I was charged but I don't have an order"

```
1. Ask for the charge id (shown on their card statement — ch_... or pi_...).
2. Grep logs for that id:
     scope="stripe.webhook.received" AND providerRef="<pi_...>"
   Expect one of:
     - stripe.webhook.payment_mismatch → security alert, do NOT refund until audit
     - stripe.webhook.invalid_payload → Stripe sent something weird. Capture event id.
     - stripe.webhook.processing_failed → handler threw. Check the error context.
     - stripe.webhook.duplicate → Stripe delivered the same event twice.

3. If none fired, the webhook never arrived. Check Stripe Dashboard →
   Developers → Events → filter by pi id → inspect delivery attempts.

4. Cross-reference in DB:
     SELECT * FROM "Payment" WHERE "providerRef" = '<pi_...>';
     SELECT * FROM "WebhookDelivery" WHERE "eventId" LIKE '%<pi_...>%';

5. If Payment.status = 'PENDING' and providerRef is set, the money is
   held but the Order never linked. Likely cause: race between
   createOrder and the webhook. Remediate: look up the orderId by
   Payment.orderId, manually confirm via the mock path (mock mode only)
   OR escalate to finance for a Stripe-side refund.
```

## Scenario 2: order is stuck in `PAYMENT_PENDING`

```
1. SELECT * FROM "Order" WHERE "orderNumber" = '<MP-...>';
2. Note the correlationId from the most recent matching
     scope="checkout.*" AND orderNumber="<MP-...>"
3. Follow the correlation:
     scope="checkout.start" correlationId="..."    → attempt started
     scope="checkout.committed" correlationId="..." → order created
   If you see `checkout.committed` but NO subsequent
   `stripe.webhook.received` for that order's providerRef, the webhook
   never landed. See Scenario 3.
4. If you see `checkout.mock_confirmation_failed`: mock confirmation
   threw. Safe to manually retry confirmOrder() from the server REPL
   (mock mode ONLY — real Stripe must wait for the webhook retry).
```

## Scenario 3: webhook never arrived

```
1. Stripe Dashboard → Developers → Webhooks → our endpoint → Events tab.
2. Find the event by timestamp or payment id. Check delivery attempts.
3. If Stripe is still retrying, nothing to do — wait.
4. If all retries failed with 5xx: check production logs for
     scope="stripe.webhook.processing_failed"
   to find our error. Likely one of:
     - DB down
     - Code bug in handler
     - Subscription-before-created race
5. If dead after 3 days, it will hit DLQ. Use the CLI (see
   "DLQ operations" section below):
     npm run dlq:list
     npm run dlq:list -- --json
6. If the local Payment row is stuck PENDING because the webhook was
   genuinely lost (Stripe delivered succeeded but our edge dropped it),
   sweep it explicitly:
     npm run reconcile:payments
   See "Payment reconciliation sweep" below.
```

## Payment reconciliation sweep (#405)

Operator-triggered sweeper. Pulls Stripe's current state for every
PENDING `Payment` row older than the cutoff and applies the matching
transition locally. Safe to re-run — every update is guarded by the
current status.

| Command | Purpose |
|---|---|
| `npm run reconcile:payments` | Default 60-min cutoff. Stripe mode only; mock exits no-op. |
| `npm run reconcile:payments -- --older-than 120` | 2-hour cutoff (less aggressive). |
| `npm run reconcile:payments -- --dry-run` | Query + log decisions without writing. |
| `npm run reconcile:payments -- --limit 100` | Cap per-invocation (default 500). |

Decision matrix — [`src/domains/payments/reconcile.ts`](../../src/domains/payments/reconcile.ts):

| Stripe PI status | Local action |
|---|---|
| `succeeded` + matching amount/currency | `Payment.status = SUCCEEDED`, `Order` → `PAYMENT_CONFIRMED`, `OrderEvent: PAYMENT_CONFIRMED` with `source: "reconcile-script"`. |
| `succeeded` + amount/currency mismatch | **Skip + log** `payments.reconcile.mismatch_amount`. Matches the webhook's `stripe.webhook.payment_mismatch` guard — operator escalates, script does not paper over tampering. |
| `canceled` | `Payment.status = FAILED`, `Order.paymentStatus = FAILED`, `OrderEvent: PAYMENT_FAILED`. |
| `requires_payment_method` | Same as canceled. Buyer declined; PI will not recover. |
| `processing` / `requires_action` / `requires_confirmation` / `requires_capture` | **Skip** — log `payments.reconcile.still_pending`, leave for next sweep. |

Output is JSON (`reviewed / markedSucceeded / markedFailed / skipped / errors`) so it can be piped to a dashboard. Run after a webhook delivery incident, before a Stripe-mode cutover, or weekly as part of operational health.

## DLQ operations (#419)

The `WebhookDeadLetter` table holds Stripe events the handler couldn't
reconcile to an existing Payment/Order. Operators triage it with two
scripts backed by `src/domains/payments/webhook-dlq-ops.ts`:

| Command | Purpose |
|---|---|
| `npm run dlq:list` | Last 50 unresolved rows, table output. |
| `npm run dlq:list -- --json` | Same content as JSON — pipe to `jq` / monitoring. |
| `npm run dlq:list -- --include-resolved` | Show historical resolved rows too. |
| `npm run dlq:list -- --event-type <type>` | Narrow by Stripe event type. |
| `npm run dlq:list -- --provider <name>` | Narrow by provider (default `stripe`). |
| `npm run dlq:list -- --limit N` | Page size (clamped 1..500). |
| `npm run dlq:resolve -- <rowId> --by "<email>"` | Stamp a row as resolved after you manually replayed it via Stripe dashboard. |
| `npm run sendcloud:replay -- --id <rowId>` | Replay a `provider='sendcloud'` DLQ row end-to-end (#568). Resolves it on success; leaves it open on failure. |
| `npm run sendcloud:replay -- --id <rowId> --dry-run` | Inspect the row without touching Sendcloud or the shipment. |

### Alert thresholds

`shouldAlertDlq()` in `webhook-dlq-ops.ts` implements the default policy:

- **total pending ≥ 10** → alert
- **new in last 24h ≥ 3** → alert

Wire the JSON output to your oncall channel (cron every 15 min):

```bash
DLQ_JSON=$(npm run -s dlq:list -- --json)
if [ "$(jq -r '.alerting' <<<"$DLQ_JSON")" = "true" ]; then
  curl -X POST "$SLACK_WEBHOOK_URL" \
    -d "{\"text\": \"DLQ alert: $(jq -c '.counts' <<<"$DLQ_JSON")\"}"
fi
```

### Manual replay flow

1. `npm run dlq:list` — pick the row to replay. Note `eventId` and `providerRef`.
2. Stripe dashboard → Developers → Events → find `eventId` → **Resend**.
3. Watch logs for `stripe.webhook.received` with that `eventId` and the
   follow-up handler event (`stripe.webhook.payment_*` or similar).
4. If it processes cleanly, mark it resolved:
   `npm run dlq:resolve -- <rowId> --by "<your@email>"`
5. If it still fails, capture the new error from
   `stripe.webhook.processing_failed` and escalate.

## Scenario 4: amount mismatch (possible fraud / tampering)

```
Any log line with scope="stripe.webhook.payment_mismatch" OR
scope="checkout.confirm_amount_mismatch" is a SECURITY alert.

1. DO NOT confirm the Payment. The guard has already blocked it.
2. Capture:
     - orderId, providerRef, expectedAmount, receivedAmount
     - userId of the order owner
     - eventId (stripe side)
3. Open an incident in the security channel.
4. Check adjacent orders from the same userId in the last 1h:
     SELECT * FROM "Order" WHERE "customerId" = '<uid>'
       AND "createdAt" > NOW() - interval '1 hour';
5. Consider suspending the account pending investigation.
```

## Scenario 5: double charge

```
1. Find BOTH Payment rows by customerId:
     SELECT id, "orderId", "providerRef", amount, status, "createdAt"
     FROM "Payment" WHERE "orderId" IN (
       SELECT id FROM "Order" WHERE "customerId" = '<uid>'
       AND "createdAt" > '<window>'
     );
2. Cross-check their correlationIds in logs:
     scope="checkout.start" userId="<uid>"
   You will see two attempts with different correlationIds — that's the
   expected signature of the buyer clicking "Pay" twice before the
   first response landed.
3. If one Payment is PENDING and the other is SUCCEEDED: refund the
   PENDING one via Stripe. The Order for the SUCCEEDED one is the
   canonical record.
4. If BOTH are SUCCEEDED: you have a real double charge. Refund one
   via Stripe → webhook will arrive → Payment.status auto-updates.
   Cross-reference via `providerRef` to pick the newer charge.
5. Root cause: if this keeps happening, ship sub-issue #309
   (server-issued submission token) to dedupe at ingress.
```

## Useful queries

### Find a Payment by provider ref (Stripe pi or mock id)

```sql
SELECT p.*, o."orderNumber", o."paymentStatus", o."customerId"
FROM "Payment" p
JOIN "Order" o ON o.id = p."orderId"
WHERE p."providerRef" = '<pi_...>';
```

### Correlate WebhookDelivery ↔ OrderEvent ↔ Payment ↔ Order

```sql
SELECT
  wd."eventId",
  wd."eventType",
  wd."status" AS webhook_status,
  wd."processedAt",
  oe."type" AS order_event_type,
  oe."payload",
  p."providerRef",
  p."status" AS payment_status,
  o."orderNumber",
  o."paymentStatus" AS order_payment_status
FROM "WebhookDelivery" wd
LEFT JOIN "OrderEvent" oe ON oe."payload"->>'eventId' = wd."eventId"
LEFT JOIN "Payment" p ON p."providerRef" = wd."payloadHash"  -- adjust match
LEFT JOIN "Order" o ON o.id = p."orderId"
WHERE wd."eventId" = '<evt_...>';
```

### Orders stuck in PENDING more than 15 minutes

```sql
SELECT "orderNumber", "customerId", "grandTotal", "createdAt"
FROM "Order"
WHERE "paymentStatus" = 'PENDING'
  AND "createdAt" < NOW() - interval '15 minutes'
ORDER BY "createdAt" DESC;
```

## Escalation ladder

1. **You (support)** — gather logs, check DB, run this runbook.
2. **On-call engineer** — if you see any of: `stripe.webhook.payment_mismatch`, `checkout.confirm_amount_mismatch`, `stripe.webhook.dead_letter_record_failed`, `stripe.webhook.delivery_update_failed` in the last hour.
3. **Security team** — any payment mismatch, or >1 mismatch events across different buyers in the same 24h.
4. **Finance / refunds** — once root cause confirmed and the refund path is clear.

## See also

- [`docs/conventions.md`](../conventions.md) — server-action + logger patterns
- [`src/lib/logger.ts`](../../src/lib/logger.ts) — structured logger API
- [`src/lib/correlation.ts`](../../src/lib/correlation.ts) — correlation ID generator
- [`docs/posthog-dashboards.md`](../posthog-dashboards.md) — Dashboard 7 ("Notification Health") covers the buyer/vendor-facing notification subsystems (telegram / email / web-push) that fire on payment events; if a buyer reports "I didn't get the receipt" or a vendor reports "I didn't get the new-order ping" alongside a payment issue, that dashboard is the next stop after the scenarios above.
- [`docs/runbooks/sentry.md`](./sentry.md) — Sentry investigation playbook (for the unhandled-exception side of the same incidents)
- [`docs/wiki/Operations Runbook.md`](../wiki/Operations%20Runbook.md) — broader ops runbook (if present)

## When adding a new log event

1. Add it to one of the two tables above (**Checkout** or **Stripe webhook**).
2. Add it to `test/features/structured-log-events.test.ts` — the regression suite that pins event names.
3. Keep the scope a dotted identifier (`domain.action.detail`), never a bracketed tag (`[legacy][stuff]`).
4. Always include `correlationId` where one is available.
