# OrderEvent vs. WebhookDelivery

Post-#308 separation of concerns between the two audit tables. Kept in-repo so the next time someone opens `prisma/schema.prisma` and sees two overlapping-looking models, they stop and read this instead of conflating them.

> Closes #409. If you add a new writer to either table, update this doc in the same PR.

---

## TL;DR

| | `OrderEvent` | `WebhookDelivery` |
|---|---|---|
| **What it is** | Business-event log attached to an `Order` | Delivery bookkeeping for incoming provider webhooks |
| **Key** | `orderId` + `createdAt` | `(provider, eventId)` UNIQUE |
| **Written by** | Any server action that mutates an order | Webhook route handlers (`/api/webhooks/stripe`, …) |
| **Dedupes?** | No — append-only narrative | **Yes — the UNIQUE constraint is the dedupe** |
| **Depends on Order existing?** | Yes (FK) | No — that's the point (see `WebhookDeadLetter`) |
| **Purged?** | No — part of the order audit trail | Rotated: drop rows > N days after `processedAt` is safe |

---

## Why two tables

Pre-#308 the Stripe webhook handler wrote every delivery into `OrderEvent` and deduped by looking up `payload->>'eventId'` in JSON. Two problems:

1. **No real uniqueness.** JSON-path lookup can't be constrained by a DB UNIQUE, so two simultaneous deliveries of the same event could both race past the dedupe check and apply the same state transition twice. This showed up in prod as the bug behind [#308](https://github.com/juanmixto/marketplace/issues/308).
2. **Coupling.** A webhook that fired *before* we had an Order row (or against a `providerRef` that had no matching Payment) had nowhere to land, because `OrderEvent.orderId` is a non-null FK. Those events were getting dropped or retried forever.

The fix: give webhooks their own table with a `(provider, eventId)` UNIQUE, and let `OrderEvent` stay a business-event log.

---

## `OrderEvent` — business-event log

[`prisma/schema.prisma:678`](../prisma/schema.prisma#L678)

```prisma
model OrderEvent {
  id        String   @id @default(cuid())
  orderId   String
  actorId   String?
  type      String     // e.g. "order.placed", "fulfillment.shipped", "refund.issued"
  payload   Json?
  createdAt DateTime @default(now())
  order Order @relation(fields: [orderId], references: [id])
  @@index([orderId])
}
```

### Who writes to it

- **Server actions** that mutate an Order: `createOrder`, `markFulfillmentShipped`, `cancelOrder`, `resolveIncident`, etc.
- **The webhook handler** after a successful state transition — but only with the *business* meaning (e.g. `"payment.succeeded"`), not the raw delivery bookkeeping.

### Read contracts

- The order timeline UI (vendor order detail, admin order view) groups these by `createdAt`.
- The analytics pipeline reads `type` to count transitions.

### Actor-required types (#1356)

`actorId` stays nullable at the DB layer because system events legitimately have no actor (Stripe webhooks, automatic transitions). But **admin-mutating** events MUST carry an actor or a forensic "who issued this refund?" has no answer.

Use [`recordOrderEvent`](../src/domains/orders/order-events.ts) (re-exported from `@/domains/orders`) for any path that emits a mutating event. It enforces the contract by throwing `OrderEventActorRequiredError` when:

```ts
ACTOR_REQUIRED_ORDER_EVENT_TYPES.has(type) && !actorId
```

Current set:
- `ORDER_CANCELLED` — admin or buyer cancellation
- `REFUND_ISSUED` — incident-resolve refund or full-cancel refund

When you introduce a new admin-mutating event (`STATUS_FORCED`, `MANUAL_REFUND`, `BLOCKED_FOR_FRAUD`, …), add it to `ACTOR_REQUIRED_ORDER_EVENT_TYPES` AND switch the call site from `tx.orderEvent.create(...)` to `recordOrderEvent(...)`. The integration test [`order-event-actor-required.test.ts`](../test/integration/order-event-actor-required.test.ts) is the contract.

### What it is NOT

- Not a dedupe substrate. Never look up `payload->>'eventId'` here to decide whether to apply a transition.
- Not a webhook-delivery log. If the webhook never found an Order, no `OrderEvent` exists — see `WebhookDeadLetter`.

---

## `WebhookDelivery` — provider-delivery ledger

[`prisma/schema.prisma:703`](../prisma/schema.prisma#L703)

```prisma
model WebhookDelivery {
  id           String    @id @default(cuid())
  provider     String    @default("stripe")
  eventId      String
  eventType    String
  providerRef  String?
  status       String    @default("received")   // "received" → "processed" | "failed"
  errorMessage String?
  payloadHash  String?   // sha256(raw body), for forensic comparison without PII
  receivedAt   DateTime  @default(now())
  processedAt  DateTime?
  @@unique([provider, eventId])
  @@index([provider, eventType, receivedAt])
  @@index([status, receivedAt])
}
```

### Lifecycle

1. **Route handler** receives a webhook POST, verifies the signature, parses the event id and type.
2. Handler **inserts** a row. If the insert fails on `@@unique([provider, eventId])` → the event is a replay, return `200` without touching business state.
3. If insert succeeded → run the business logic (update Payment, move Order forward, append an `OrderEvent`).
4. Handler **updates** the row to `status = 'processed'` with `processedAt = now()` (or `'failed'` + `errorMessage` on error).

### Who writes to it

- `/api/webhooks/stripe` and any future `/api/webhooks/{provider}` route handler.
- **Nothing else**. Business code never reads or writes `WebhookDelivery`.

### Why `payloadHash` and not the full payload

Provider payloads can carry PII (billing addresses, partial card metadata, customer emails). Storing `sha256(raw)` gives us "was this delivery identical to the last one?" forensics without retention risk.

### Why a separate table and not just a UNIQUE on `OrderEvent`

Because webhooks arrive *before* we might have an order (race), *after* we might have cancelled one, or for an event type that doesn't even map to an Order (`charge.dispute.created` against a Payment). `OrderEvent.orderId` is non-null; `WebhookDelivery` has no FK to Order.

---

## `WebhookDeadLetter` — unresolvable deliveries

Out of scope for this doc but worth mentioning for the shape of the story: if `WebhookDelivery` is inserted successfully but the handler can't reconcile the event to an Order/Payment (e.g. unknown `providerRef`), the handler writes a `WebhookDeadLetter` row and returns `200` to the provider so it stops retrying. An operator replays from the Stripe dashboard once the underlying issue is fixed.

---

## Adding a new webhook source

1. Add a route handler at `/api/webhooks/{provider}`.
2. On arrival, insert into `WebhookDelivery` with `provider = '{provider}'` — **not** a new table. The UNIQUE is per-provider, not global.
3. On successful business transition, append to `OrderEvent` with a `type` string that includes the provider (`"sendcloud.shipment.delivered"`, not just `"shipment.delivered"`).
4. Add a test that replays the same `eventId` twice and asserts only one business transition runs.

---

## See also

- [`docs/state-machines.md`](state-machines.md) — what business transitions can actually happen when a webhook arrives
- [`docs/runbooks/payment-incidents.md`](runbooks/payment-incidents.md) — investigating stuck webhooks in prod
- [`docs/checkout-dedupe.md`](checkout-dedupe.md) — sister concept at the checkout layer
- Original RFC: #308 (webhook dedupe swap), #309 (concurrent-submit checkout dedupe)
