# Orders Flow

## Purpose

End-to-end happy path for turning a cart into a paid, confirmed order — including validation, Stripe interaction, and post-payment side effects.

## Key Entities / Concepts

- **Entry point** — `createOrder()` server action in `src/domains/orders/actions.ts`.
- **Pricing** — computed server-side only; client cart never supplies prices.
- **Payment** — a Stripe Payment Intent is created inside the same DB transaction that writes the `Order`, `OrderLine[]`, `Payment`, and `VendorFulfillment[]` rows.
- **Idempotency** — `Order.checkoutAttemptId` UNIQUE constraint dedupes double-submits; see `docs/checkout-dedupe.md`.
- **Confirmation** — status flips to `PAYMENT_CONFIRMED` only via the Stripe webhook at `src/app/api/webhooks/stripe/route.ts` — never from the browser.

## Diagram

```mermaid
sequenceDiagram
  autonumber
  actor Buyer
  participant UI as Checkout UI
  participant Action as createOrder()<br/>server action
  participant DB as Postgres (Prisma)
  participant Stripe
  participant WH as /api/webhooks/stripe
  participant Email as Resend

  Buyer->>UI: Submit checkout<br/>(checkoutAttemptId, address, items)
  UI->>Action: invoke
  Action->>Action: Auth check + schema validate
  Action->>DB: Load products (authoritative prices)
  Action->>Action: Stock precheck
  Action->>Action: calculateOrderPricing()<br/>+ evaluatePromotions()
  Action->>Stripe: createPaymentIntent()<br/>(Connect destination if single vendor)
  Stripe-->>Action: PaymentIntent + clientSecret

  rect rgba(180,220,255,0.3)
  note over Action,DB: Single DB transaction
  Action->>DB: INSERT Order (PLACED / PENDING)
  Action->>DB: INSERT OrderLine[]
  Action->>DB: INSERT Payment (providerRef = PI id)
  Action->>DB: INSERT VendorFulfillment[]
  Action->>DB: UPDATE stock (decrement)
  Action->>DB: UPDATE promotion redemptions
  Action->>DB: INSERT OrderEvent (ORDER_CREATED)
  end

  Action-->>UI: { orderId, clientSecret, orderNumber }
  UI->>Stripe: confirmCardPayment(clientSecret)
  Stripe-->>UI: 3DS / success

  Stripe->>WH: payment_intent.succeeded
  WH->>DB: Order.status = PAYMENT_CONFIRMED<br/>Payment.status = SUCCEEDED
  WH->>DB: INSERT OrderEvent (PAYMENT_CONFIRMED)
  WH->>Email: Send order confirmation
  WH-->>Stripe: 200 OK
```

## Notes

- **Stock is decremented at order-creation time**, before payment clears. Failed payments therefore require a compensating stock restore on cancel/refund.
- **Prices are snapshot** onto `OrderLine` — later price changes on `Product` do not mutate historical orders.
- **`checkoutAttemptId`** is required on every call; the UNIQUE constraint makes a second attempt with the same id a no-op that returns the original order (see `docs/checkout-dedupe.md`).
- **Webhook is the only writer of `PAYMENT_CONFIRMED`** — browsers can lie; Stripe signatures can't. The webhook signature secret is `STRIPE_WEBHOOK_SECRET`.
- **Split-vendor orders** keep funds on the platform account; per-vendor payouts happen later via the settlements domain.
- **Incident runbook** for payment issues: `docs/runbooks/payment-incidents.md` — do not rename `checkout.*` or `stripe.webhook.*` log scopes without updating it.
