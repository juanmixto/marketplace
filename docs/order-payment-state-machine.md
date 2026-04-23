# Order and payment state machine

Canonical reference for the order/payment lifecycle used by checkout, the Stripe webhook, mock confirmation, and incident triage.

The key principle is that `Order.status` and `Order.paymentStatus` are related but distinct:

- order status describes fulfillment progress
- payment status describes money movement / provider confirmation

## Current lifecycle

### Order statuses

| Status | Meaning |
|---|---|
| `PLACED` | Order created, stock reserved, payment still pending. |
| `PAYMENT_CONFIRMED` | Payment succeeded and the order is now financially confirmed. |
| `PROCESSING` | Vendor or ops has moved the order into fulfillment work. |
| `PARTIALLY_SHIPPED` | Some fulfillments shipped, others still pending. |
| `SHIPPED` | All fulfillments shipped. |
| `DELIVERED` | All fulfillments delivered. |
| `CANCELLED` | Terminal cancellation state. |
| `REFUNDED` | Terminal refund state. |

### Payment statuses

| Status | Meaning |
|---|---|
| `PENDING` | Payment exists but Stripe has not confirmed success or failure yet. |
| `SUCCEEDED` | Stripe has confirmed the charge. |
| `FAILED` | Payment provider failed or the payment intent creation path failed. |
| `REFUNDED` | Payment was fully refunded. |
| `PARTIALLY_REFUNDED` | Payment was partially refunded. |

## Canonical transitions

### Checkout creation

- `createOrder()` creates:
  - `Order.status = PLACED`
  - `Order.paymentStatus = PENDING`
- The payment row is created in parallel and later linked to the provider reference.

### Stripe webhook: `payment_intent.succeeded`

- The payment row transitions to `SUCCEEDED`.
- The order transitions from `PLACED` to `PAYMENT_CONFIRMED`.
- A `PAYMENT_CONFIRMED` order event is written exactly once for the successful transition.

### Stripe webhook: `payment_intent.payment_failed`

- The payment row transitions to `FAILED`.
- The order remains in its current fulfillment state, typically `PLACED`.
- A `PAYMENT_FAILED` order event is written when the transition is applied.

### Mock confirmation

- `confirmOrder()` in mock mode mirrors the same successful-payment transition as the Stripe webhook.
- This path exists for local and test flows only.

## Invalid transitions and guardrails

- `CANCELLED` and `REFUNDED` orders must not transition back to `PAYMENT_CONFIRMED`.
- Already confirmed payments must not be reconfirmed.
- Already failed payments must not be failed again.
- Duplicate Stripe webhooks are a no-op after idempotency checks.
- Amount mismatches must not confirm the order.

## Code references

- [`src/app/api/webhooks/stripe/route.ts`](../src/app/api/webhooks/stripe/route.ts)
- [`src/domains/payments/webhook.ts`](../src/domains/payments/webhook.ts)
- [`src/domains/orders/use-cases/confirm-order.ts`](../src/domains/orders/use-cases/confirm-order.ts)
- [`src/domains/orders/payment-persistence.ts`](../src/domains/orders/payment-persistence.ts)

## Notes

- This document describes the current implementation, not an aspirational future workflow.
- If refunds or additional fulfillment states expand the lifecycle, update this document and the tests together.
