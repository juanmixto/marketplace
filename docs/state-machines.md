# Order, Payment, Fulfillment & Shipment State Machines

Canonical reference for the four state enums that drive the purchase
flow. Kept in-repo because the Prisma enum values are the source of
truth, but the **allowed transitions** are enforced in application code
(`src/domains/shipping/domain/state-machine.ts`, `src/domains/payments/webhook.ts`,
etc.) and cannot be read off the schema alone.

> Closes #312. If you add or rename a state, update this doc **and** the
> corresponding guard function in the same PR.

---

## 1. `OrderStatus`

Defined in [`prisma/schema.prisma:55`](../prisma/schema.prisma#L55).

```
enum OrderStatus {
  PLACED
  PAYMENT_CONFIRMED
  PROCESSING
  PARTIALLY_SHIPPED
  SHIPPED
  DELIVERED
  CANCELLED
  REFUNDED
}
```

### Transition diagram

```
           ┌───────────────┐
           │    PLACED     │◀── created by createCheckoutOrder
           └──────┬────────┘
                  │ Stripe webhook: payment_intent.succeeded
                  ▼
           ┌──────────────────────┐
           │  PAYMENT_CONFIRMED   │
           └──────┬───────────────┘
                  │ vendor flips first fulfillment → PREPARING
                  ▼
           ┌──────────────────┐
           │   PROCESSING     │──┐
           └──────┬───────────┘  │ per-vendor SHIPPED while others lag
                  │              ▼
                  │       ┌─────────────────────┐
                  │       │ PARTIALLY_SHIPPED   │
                  │       └──────┬──────────────┘
                  │              │ last fulfillment → SHIPPED
                  │              │
                  ▼              ▼
            ┌───────────────────────┐
            │       SHIPPED         │
            └──────┬────────────────┘
                   │ last fulfillment → DELIVERED
                   ▼
            ┌───────────────────────┐
            │      DELIVERED        │◀── terminal (happy path)
            └───────────────────────┘

                  ⇣ side terminals
   PLACED ─────────► CANCELLED       (buyer or admin cancels; refund handles money)
   PAYMENT_CONFIRMED ─► CANCELLED    (fulfillment cannot start; refund required)
   PAYMENT_CONFIRMED ─► REFUNDED     (admin-issued refund after capture)
   *any post-capture* ─► REFUNDED    (full refund through Stripe)
```

### Invariants

- `CANCELLED`, `DELIVERED`, `REFUNDED` are terminal.
- `PROCESSING` is derived: the order is in PROCESSING iff **at least one** fulfillment is past `PENDING` and **not all** are in a shipped state.
- `PARTIALLY_SHIPPED` is only legal with ≥ 2 vendors on the order.
- Stripe webhook is the only writer for `PLACED → PAYMENT_CONFIRMED`.

---

## 2. `PaymentStatus`

Defined in [`prisma/schema.prisma:66`](../prisma/schema.prisma#L66). Guard functions live in [`src/domains/payments/webhook.ts`](../src/domains/payments/webhook.ts).

```
enum PaymentStatus {
  PENDING
  SUCCEEDED
  FAILED
  REFUNDED
  PARTIALLY_REFUNDED
}
```

### Transition diagram

```
       ┌──────────┐  payment_intent.succeeded
       │ PENDING  │──────────────────────────▶ ┌───────────┐
       └──┬───────┘                             │ SUCCEEDED │
          │ payment_intent.payment_failed       └─────┬─────┘
          ▼                                           │ refund.created (full)
       ┌────────┐                                     ▼
       │ FAILED │                              ┌────────────┐
       └────────┘                              │  REFUNDED  │
                                               └─────┬──────┘
                                                     ▲
                                                     │ refund.created (partial)
                                                     │
                                         ┌───────────┴─────────┐
                                         │ PARTIALLY_REFUNDED  │
                                         └─────────────────────┘
```

### Invariants (enforced by `shouldApplyPaymentSucceeded` / `shouldApplyPaymentFailed`)

- Once `paymentStatus` is `SUCCEEDED`, a late `payment_intent.payment_failed` is a no-op (idempotency, see #308).
- A `FAILED` payment cannot transition back to `PENDING` — the buyer retries with a new `PaymentIntent`.
- Order-level `paymentStatus` mirrors the Payment-row status **after** the webhook applies; the two are checked together in `shouldApply*` to keep idempotency even when the order/payment rows drift during retries.
- `REFUNDED` and `PARTIALLY_REFUNDED` require a matching `providerRef` on the Payment row (`assertProviderRefForPaymentStatus`).

---

## 3. `FulfillmentStatus`

Defined in [`prisma/schema.prisma:74`](../prisma/schema.prisma#L74).

```
enum FulfillmentStatus {
  PENDING          // created with the order
  CONFIRMED        // vendor has acknowledged it
  PREPARING        // vendor is assembling
  LABEL_REQUESTED  // carrier API call in flight
  LABEL_FAILED     // carrier returned an error — terminal until retry
  READY            // label printed, package waiting for pickup
  SHIPPED          // handed to carrier (IN_TRANSIT / OUT_FOR_DELIVERY)
  DELIVERED        // terminal happy path
  INCIDENT         // package exception (damaged, lost, returned)
  CANCELLED        // terminal; refund happens on the payment side
}
```

### Transition rules

The mapping from a ShipmentStatus event to a FulfillmentStatus lives in `fulfillmentStatusForShipment()` ([`src/domains/shipping/transitions.ts:48`](../src/domains/shipping/transitions.ts#L48)):

| Shipment event    | New fulfillment status |
|-------------------|------------------------|
| `LABEL_CREATED`   | `READY`                |
| `IN_TRANSIT`      | `SHIPPED`              |
| `OUT_FOR_DELIVERY`| `SHIPPED`              |
| `DELIVERED`       | `DELIVERED`            |
| `FAILED`          | `LABEL_FAILED`         |
| `CANCELLED`       | `CANCELLED`            |
| _other_           | _no change_            |

- `INCIDENT` is written only by Sendcloud exception webhooks (`EXCEPTION` ShipmentStatus) and the admin incident action.
- `DELIVERED` / `CANCELLED` / `LABEL_FAILED` are the terminals for the happy path, the abort path, and the retry-needed path respectively.
- Vendor UI can move `CONFIRMED → PREPARING` manually; other transitions are webhook-driven.

---

## 4. `ShipmentStatus`

Internal type: [`ShipmentStatusInternal`](../src/domains/shipping/domain/types.ts). Transition predicate: [`isValidTransition`](../src/domains/shipping/domain/state-machine.ts) in `src/domains/shipping/domain/state-machine.ts`.

```
enum ShipmentStatus {
  DRAFT
  LABEL_REQUESTED
  LABEL_CREATED
  IN_TRANSIT
  OUT_FOR_DELIVERY
  DELIVERED
  EXCEPTION
  CANCELLED
  FAILED
}
```

### Rank-based transitions

States are ranked in `RANK` ([`state-machine.ts:3`](../src/domains/shipping/domain/state-machine.ts#L3)):

```
DRAFT(0) → LABEL_REQUESTED(1) → LABEL_CREATED(2) → IN_TRANSIT(3)
                                          ↘
                                  EXCEPTION(3) ⇄ IN_TRANSIT / OUT_FOR_DELIVERY
                                          ↘
                           → OUT_FOR_DELIVERY(4) → DELIVERED(5)

Terminal (rank 6, irreversible): CANCELLED, FAILED
Terminal (rank 5, irreversible): DELIVERED
```

Concrete rules enforced by `isValidTransition`:

1. Never transition **from** a terminal state (`DELIVERED`, `CANCELLED`, `FAILED`).
2. Forward jumps are allowed — Sendcloud may deliver webhooks out of order and we want the highest-seen state to stick.
3. Backward transitions are **rejected** except `EXCEPTION → IN_TRANSIT` / `EXCEPTION → OUT_FOR_DELIVERY` (recovery path).
4. Transitioning **to** `EXCEPTION`, `CANCELLED`, or `FAILED` is always allowed from non-terminal.

---

## 5. How the four interact

```
buyer                Stripe                vendor              carrier
  │                    │                     │                    │
  ├─ createOrder ─────►│                     │                    │
  │       PLACED       │                     │                    │
  │                    ├─ succeeded ────────►│ PAYMENT_CONFIRMED  │
  │                    │ PaymentStatus=      │ per-fulfillment    │
  │                    │ SUCCEEDED           │ PENDING            │
  │                    │                     ├─ PREPARING ────────┤
  │                    │                     │                    │
  │                    │                     ├─ LABEL_REQUESTED ─►│ DRAFT→LABEL_CREATED
  │                    │                     │                    │
  │                    │                     │    READY           │
  │                    │                     │◄──────────── IN_TRANSIT
  │                    │                     │    SHIPPED         │
  │                    │                     │◄──────────── DELIVERED
  │                    │                     │    DELIVERED       │
  │                    │                                          │
  │  Order = DELIVERED when all fulfillments are DELIVERED.       │
```

- **Refund path**: buyer/admin triggers Stripe refund → Payment → `REFUNDED`/`PARTIALLY_REFUNDED`. Order moves to `REFUNDED` only if the refund was full; partial refunds leave Order status untouched.
- **Cancel path**: only legal while the order is `PLACED` or `PAYMENT_CONFIRMED`. Downstream fulfillments move to `CANCELLED`; shipments (if any) can still be force-cancelled.
- **Incident path**: triggered from Sendcloud `EXCEPTION` events or admin action. Fulfillment moves to `INCIDENT`; the order stays in its current shipping state and admin resolves out-of-band via the incidents surface.

---

## See also

- [`docs/runbooks/payment-incidents.md`](runbooks/payment-incidents.md) — investigation recipes
- [`docs/checkout-dedupe.md`](checkout-dedupe.md) — `checkoutAttemptId` idempotency
- [`src/domains/shipping/domain/state-machine.ts`](../src/domains/shipping/domain/state-machine.ts) — shipment transition predicate
- [`src/domains/payments/webhook.ts`](../src/domains/payments/webhook.ts) — payment transition guards
