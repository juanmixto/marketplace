# Checkout idempotency — the `checkoutAttemptId` contract

Closes the cluster #410 (backend) / #411 (UX decisions) / #412 (tests) / #524 (client wiring).

## Why this exists

Checkout is the highest-stakes action in the app. A single buyer click
can fire multiple `createOrder()` calls via any of:

- Double-click on the submit button before the first response returns
- Mobile network retry after a dropped response
- Browser tab refresh mid-request
- Back / forward navigation with form-resubmit

Without deduplication, each of these produces a fresh Order + Payment
Intent. For mock mode that just means messy data; for real Stripe
that means a real double charge.

## How it works

1. **Server renders checkout page** → generates a fresh
   `checkoutAttemptId` (format: `cat_<ts36>_<32hex>`, see
   `src/domains/orders/checkout-token.ts`). `src/app/(buyer)/checkout/page.tsx`
   is `export const dynamic = 'force-dynamic'` so every render produces
   a unique token — a cached render would reuse the same id across users.
2. **Client (`CheckoutPageClient`)** stores the id in a `useRef` so
   React state churn during the submit flow never regenerates it.
   Sends it with the cart via `options.checkoutAttemptId`.
3. **`createOrder` pre-check** — reads any existing `Order` with that
   token. If one exists and is owned by the current session:
     - Return `{ orderId, orderNumber, replayed: true, clientSecret: '' }`
     - No new Order, no new Payment Intent.
     - If the existing order belongs to a different user, reject with a
       generic error (never leak the Order id).
4. **`createOrder` commit** — runs the normal transaction. The new
   Order's `checkoutAttemptId` column is written with a `UNIQUE`
   constraint.
5. **Race loser** — if two concurrent callers made it past the pre-check
   before either committed, the second transaction trips the `UNIQUE`
   violation. The catch block detects the P2002 error on this specific
   field, re-reads the winner row, and returns it with `replayed: true`.

## UX matrix

| Scenario | `replayed` flag | What the client should do |
|---|---|---|
| First submit, success | `false` | Show confirmation, clear cart, redirect to `/cuenta/pedidos/<id>` |
| Double-click race | `true` (loser), `false` (winner) | Loser same UX as winner (both land on confirmation) |
| Network drop, user retries same form | `true` | Show "tu pedido ya está registrado" toast, redirect to `/cuenta/pedidos/<id>` |
| Tab refresh mid-submit, re-submit | `true` | Same as above |
| User edits cart, re-submits with same token | `false` (new Order if original failed before commit) OR `true` (same token already committed — cart edit ignored) | Client must regenerate the token when the user navigates back to the cart, not reuse the stale one |
| Buyer B replays buyer A's token | rejected with "Sesión de checkout inválida" | Client shows the friendly error and refreshes the checkout page |

### What the client must NOT do

- **Reuse a token across cart edits.** If the buyer goes back to the
  cart and changes quantities, the client must fetch a fresh token on
  the next render of the checkout page. Reusing the old token either
  creates an Order with the OLD cart (pre-check path) or a new Order
  with the NEW cart (if the first attempt never committed).
- **Assume `clientSecret` is present on replay.** It's not. We don't
  store Stripe's client secret server-side. On replay, redirect to the
  confirmation page — don't try to re-confirm the payment.

### Mock-mode follow-up confirmation

`createCheckoutOrder` wraps `createOrder` with an auto-confirm step in
mock mode. On replay, this step is **skipped** — the first call already
did the confirmation (or failed it, in which case the retry should go
through the webhook path, not a fresh mock confirm).

## Server logs

Two structured log events pin the dedupe behaviour (scope naming per
#414 convention):

| Event | Emitted when |
|---|---|
| `checkout.replayed` | Pre-check found an existing Order with this token |
| `checkout.concurrent_replayed` | Transaction lost the UNIQUE race; winner returned |
| `checkout.attempt_id_cross_user` | Someone presented another user's token — reject and log for security audit |

All three carry `correlationId`, `checkoutAttemptId`, `userId`, `orderId`,
`orderNumber` for grep-ability.

## When a token is missing

`createOrder(..., {})` (no `checkoutAttemptId`) preserves the pre-#410
behaviour: every call creates a fresh Order. This keeps older callers
(tests, server-to-server flows) working without change. The client-side
checkout page is expected to always provide a token post-#410.

## Threat model

| Threat | Mitigation |
|---|---|
| Attacker guesses another user's token | 32 hex chars of randomness (≈ 128 bits). Infeasible. |
| Attacker learns another user's token (shoulder surf, network sniff) | Pre-check rejects with cross-user error, logs `checkout.attempt_id_cross_user` |
| Attacker brute-forces many tokens | Rate-limiting on the checkout endpoint (existing, unchanged). A grep on `checkout.attempt_id_cross_user` would spike. |
| Client caches a stale token and resubmits hours later | Token shape is purely structural — no expiry enforced server-side. The pre-check still finds the existing Order (or nothing if it never committed) and returns consistently. |

## References

- Parent: [#309](https://github.com/juanmixto/marketplace/issues/309)
- Backend implementation: [#410](https://github.com/juanmixto/marketplace/issues/410)
- UX matrix (this doc): [#411](https://github.com/juanmixto/marketplace/issues/411)
- Integration tests: [#412](https://github.com/juanmixto/marketplace/issues/412)
- Related observability: [`docs/runbooks/payment-incidents.md`](runbooks/payment-incidents.md)
