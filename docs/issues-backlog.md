# Technical issue backlog

This document contains a proposed issue backlog derived from a review of the repository. It is intentionally written so another coding agent can execute each item with minimal ambiguity.

Scope of review used to build this backlog:
- checkout and order creation
- payment provider abstraction
- Stripe webhook handling
- auth and role-based route protection
- schema design and CI

Important execution rule for every issue below:
- prefer additive, backward-compatible changes
- do not change checkout or payment behavior without tests that preserve current flows
- avoid broad refactors unless explicitly requested in the issue
- ship in small PRs with clear rollback paths

---

## Issue 1 — Prevent orphan PaymentIntents when order creation fails

**Type**: reliability / payments  
**Priority**: P0  
**Suggested labels**: `payments`, `checkout`, `reliability`, `backend`

### Problem
`createOrder()` creates the external payment intent before the database transaction that reserves stock and persists the order. If the transaction later fails due to stock, deadlock, validation drift, or any transient database issue, an external payment intent may exist without a corresponding persisted order.

This can create operational noise and make reconciliation harder, especially once Stripe is used in non-mock mode.

### Current implementation hotspots
- `src/domains/orders/actions.ts`
- `src/domains/payments/provider.ts`

### Why this matters
- orphan external payment intents complicate support and reconciliation
- future analytics on checkout drop-off become less trustworthy
- if retry logic is added later, duplicate external intents become more likely

### Goal
Restructure the checkout flow so external payment intents cannot be left behind without a durable local order record, or at minimum so they can be deterministically reconciled.

### Constraints
- do not break current mock-payment developer flow
- do not weaken server-side price calculation guarantees
- do not remove current stock-locking logic inside the transaction
- preserve current `createCheckoutOrder()` contract unless there is a very strong reason to change it

### Recommended implementation direction
Prefer one of these two approaches:

**Option A — Persist-first flow**
1. create local order in a pre-payment state inside the database transaction
2. create local payment row with a temporary local status and without final `providerRef`
3. after transaction succeeds, create external payment intent
4. update payment row with `providerRef` and client secret metadata if needed
5. return the client secret to the caller

**Option B — Explicit reconciliation flow**
Keep the current order of operations only if all of the following are added:
1. durable log/event for every external payment intent creation attempt
2. reconciliation job or command to detect intents without orders
3. cancellation or safe expiration strategy for orphan intents
4. tests proving failure scenarios are handled

Option A is preferred because it reduces system ambiguity.

### Acceptance criteria
- no external Stripe payment intent is created without a corresponding durable local record that can be reconciled
- mock payment mode continues to auto-confirm as today
- checkout still calculates all totals server-side
- failure during stock reservation or DB transaction does not leave silent orphan state
- tests cover at least:
  - DB transaction failure after checkout validation
  - stock conflict failure
  - payment provider failure after local order pre-creation
  - mock mode happy path remains green

### Required tests
- integration test simulating transaction failure after payment setup decision point
- unit or integration test for cleanup/reconciliation path
- regression test for current successful checkout flow

### Definition of done
- implementation merged with tests
- README or internal docs updated to reflect new order/payment lifecycle
- local support/debugging notes added if manual reconciliation remains necessary

---

## Issue 2 — Remove runtime tolerance for missing migrated columns in checkout

**Type**: schema / deployment safety  
**Priority**: P1  
**Suggested labels**: `database`, `checkout`, `deployment`, `hardening`

### Problem
`createOrder()` currently catches missing-column errors related to `shippingAddressSnapshot` and retries order creation without persisting that snapshot. This keeps checkout alive during schema drift, but it also means application code tolerates an incompatible database state at runtime.

### Current implementation hotspot
- `src/domains/orders/actions.ts`

### Why this matters
- production correctness should not depend on fallback behavior for partial migrations
- checkout data quality degrades silently when the fallback path is used
- hidden app/database drift makes incident diagnosis harder

### Goal
Move from runtime tolerance to deployment correctness. The application should assume required columns exist once code is deployed.

### Constraints
- avoid breaking local development convenience unnecessarily
- any stricter behavior must be accompanied by clearer deployment validation

### Recommended implementation direction
1. remove the retry path that omits `shippingAddressSnapshot` for normal runtime operation
2. add a startup or health-check validation that required schema expectations are satisfied
3. ensure CI/build/deploy path makes migration mismatch very visible before production traffic hits the app
4. if you want to preserve temporary compatibility for local developer environments, guard it behind an explicit development-only flag with loud logging

### Acceptance criteria
- checkout no longer silently downgrades persisted order data because of missing schema columns in normal environments
- deployment pipeline clearly fails or warns before incompatible code/database combinations are live
- local development ergonomics remain acceptable
- tests cover the expected behavior for schema mismatch handling if a dev-only compatibility mode remains

### Required tests
- test for schema validation helper if introduced
- regression test ensuring orders always persist shipping snapshot in supported environments

### Definition of done
- runtime fallback removed or strictly isolated to explicit development mode
- deployment guidance documented

---

## Issue 3 — Introduce a dedicated webhook idempotency store instead of querying `OrderEvent.payload`

**Type**: payments / data model / scalability  
**Priority**: P1  
**Suggested labels**: `payments`, `stripe`, `database`, `scalability`

### Problem
Webhook idempotency currently checks for prior processing by querying `OrderEvent` using a JSON payload path lookup for `eventId`. This works as a first pass, but it mixes domain events with delivery deduplication concerns and may become slower or harder to reason about as event volume grows.

### Current implementation hotspots
- `src/app/api/webhooks/stripe/route.ts`
- `src/domains/payments/webhook.ts`
- `prisma/schema.prisma`

### Why this matters
- webhook deduplication is infrastructure logic, not business-event history
- JSON-path queries are harder to index and reason about than first-class columns
- replay handling, dead-lettering, and observability are easier with a dedicated table

### Goal
Create a first-class persistence mechanism for webhook delivery tracking.

### Recommended implementation direction
Add a model similar to:
- `WebhookDelivery`
  - provider
  - eventId
  - eventType
  - providerRef
  - processedAt
  - status (`received`, `processed`, `failed`, `ignored`)
  - error message if any
  - raw payload hash or safe metadata for debugging

Then:
1. insert or upsert a delivery record as early as possible
2. use a unique constraint on `(provider, eventId)`
3. drive idempotency from that table, not from `OrderEvent.payload`
4. keep `OrderEvent` only for business lifecycle changes

### Constraints
- preserve current behavior for duplicate webhooks: duplicates should safely no-op
- do not store sensitive raw payload data unless necessary and justified
- keep the route resilient to retries and partial failures

### Acceptance criteria
- duplicate Stripe events are deduplicated via first-class storage
- business events remain in `OrderEvent`, but delivery bookkeeping is separated
- route behavior for duplicate events remains safe and deterministic
- migrations are backward-compatible

### Required tests
- duplicate `payment_intent.succeeded` event processed twice
- event recorded as failed and then retried successfully if applicable
- no duplicate order confirmation event created for the same provider event

### Definition of done
- new schema migration merged
- webhook route uses the new idempotency model
- any necessary cleanup/backfill strategy documented

---

## Issue 4 — Add end-to-end idempotency and replay safety for checkout submission

**Type**: checkout / reliability  
**Priority**: P1  
**Suggested labels**: `checkout`, `reliability`, `backend`, `payments`

### Problem
The webhook path has explicit idempotency logic, but the checkout submission path itself does not appear to expose a client-facing idempotency key or replay protection boundary. Double submits, browser retries, flaky mobile connections, or impatient users can still create operational edge cases.

### Current implementation hotspot
- `src/domains/orders/actions.ts`

### Goal
Ensure repeated submission of the same checkout intent cannot accidentally create multiple orders or multiple payment initialization attempts for the same intended purchase.

### Recommended implementation direction
1. introduce a checkout attempt or submission token
2. bind the token to the authenticated customer, cart contents signature, and short validity window
3. reject, reuse, or safely resume repeated submissions depending on the chosen UX
4. ensure retrying a request after a network interruption leads to deterministic behavior

### Constraints
- do not reduce current stock safety
- do not rely on client trust alone
- preserve current mock payment UX

### Acceptance criteria
- repeated identical submissions within a short window are safe
- system behavior is deterministic and documented
- user does not end up with ambiguous duplicate orders from a double click or retry

### Required tests
- same checkout token submitted twice concurrently
- same checkout token retried after first request succeeds but client loses response
- different carts must not collide in idempotency storage

### Definition of done
- checkout replay behavior documented and tested
- logs make it clear when a submission was replayed, resumed, or rejected

---

## Issue 5 — Harden authorization at resource level for server actions and domain operations

**Type**: security / authorization  
**Priority**: P0  
**Suggested labels**: `security`, `auth`, `authorization`, `backend`

### Problem
Route-level authorization is present for admin, vendor, and buyer areas, and some resource ownership checks are implemented in actions like `confirmOrder()`. However, route gating alone is not sufficient protection. Every server action and domain operation that mutates or reveals sensitive data must enforce authorization against the resource itself.

### Current implementation hotspots
- `src/lib/auth-config.ts`
- `src/domains/orders/actions.ts`
- vendor/admin actions and pages not yet exhaustively audited

### Goal
Perform a systematic resource-level authorization hardening pass.

### Recommended implementation direction
1. inventory server actions, route handlers, and sensitive loaders by domain
2. for each operation, identify:
   - who can call it
   - which resource is being accessed
   - what ownership or role condition must hold
3. centralize permission checks where practical
4. make denial explicit with consistent error behavior
5. add focused tests for cross-tenant and cross-role access attempts

### Constraints
- avoid broad framework rewrites just to centralize authorization
- prioritize correctness over elegance
- do not assume URL structure provides security

### Acceptance criteria
- every sensitive mutation and read has an explicit role/ownership guard
- vendor cannot access or mutate another vendor’s data
- customer cannot access another customer’s orders, addresses, incidents, or payments
- lower-privilege admins cannot access finance/ops capabilities unless explicitly allowed
- tests cover at least one negative case per protected domain area

### Required tests
- customer A attempts to read or mutate customer B resources
- vendor A attempts to access vendor B catalog/order data
- non-finance admin attempts to access finance-only action if such action exists

### Definition of done
- authorization audit checklist committed to repo or PR description
- permission helpers documented if new ones are introduced

---

## Issue 6 — Add structured operational logging and correlation IDs for checkout and webhook flows

**Type**: observability  
**Priority**: P1  
**Suggested labels**: `observability`, `logging`, `payments`, `operations`

### Problem
The code uses `console.error` and `console.warn` with useful messages, but once this runs in production it will be difficult to trace a single checkout or webhook across retries, payment provider events, stock reservation, and order confirmation without stable correlation identifiers.

### Current implementation hotspots
- `src/domains/orders/actions.ts`
- `src/domains/payments/provider.ts`
- `src/app/api/webhooks/stripe/route.ts`
- `src/domains/payments/webhook.ts`

### Goal
Introduce structured logs with consistent fields so production incidents can be debugged quickly.

### Recommended implementation direction
1. define a minimal structured logging helper or adapter
2. include correlation fields such as:
   - orderId
   - orderNumber
   - providerRef
   - webhook eventId
   - userId when appropriate
   - checkout attempt id if issue 4 is implemented
3. replace ad-hoc console calls in critical payment/checkout paths
4. keep messages human-readable and machine-filterable

### Constraints
- do not log secrets, raw auth tokens, or full PII payloads
- keep implementation light; avoid introducing an overly heavy logging platform abstraction unless needed

### Acceptance criteria
- critical checkout and webhook logs include stable correlation identifiers
- retry exhaustion, mismatch, duplicate, and payment-confirmed events are easy to trace from logs
- sensitive values are redacted or omitted

### Required tests
- unit tests for logger helper if introduced
- regression tests are optional unless logging affects behavior, but lintable conventions or snapshot tests are welcome

### Definition of done
- operational runbook note added for how to trace a failed checkout or webhook

---

## Issue 7 — Define and document the canonical order/payment state machine

**Type**: domain design / maintainability  
**Priority**: P2  
**Suggested labels**: `domain`, `documentation`, `payments`, `orders`

### Problem
The code already encodes meaningful state transitions across `OrderStatus`, `PaymentStatus`, webhook updates, manual mock confirmation, and order events. However, the canonical lifecycle is still mostly implicit in code.

As the project grows to support refunds, incidents, settlements, and Stripe Connect, lack of an explicit state machine will make future changes riskier.

### Current implementation hotspots
- `prisma/schema.prisma`
- `src/domains/orders/actions.ts`
- `src/domains/payments/webhook.ts`
- webhook route and future refunds/incidents logic

### Goal
Make the allowed state transitions explicit and testable.

### Recommended implementation direction
1. document the canonical lifecycle for:
   - order creation
   - payment pending
   - payment confirmed
   - payment failed
   - shipped / delivered
   - cancelled / refunded
2. identify invalid transitions
3. where appropriate, move transition logic into reusable helpers instead of scattering conditions
4. add tests for transition rules

### Acceptance criteria
- there is a single reference document or module describing allowed transitions
- invalid transitions are easier to detect in code review and tests
- future work on refunds and incidents has a stable baseline to build from

### Required tests
- targeted tests for transition helper functions if introduced
- regression tests for current success and failure transitions

### Definition of done
- documentation committed in `docs/` or similar
- code references the documented lifecycle where practical

---

## Issue 8 — Strengthen CI to catch schema/runtime drift and production-critical regressions earlier

**Type**: CI / quality  
**Priority**: P1  
**Suggested labels**: `ci`, `quality`, `database`, `deployment`

### Problem
The current CI is already solid: typecheck, coverage, build, migrate, DB tests, and integration tests. However, given the checkout fallback for missing schema columns and the importance of payment correctness, CI should do more to validate runtime expectations and prevent deployment drift.

### Current implementation hotspot
- `.github/workflows/ci.yml`

### Goal
Make CI a stronger gate for payment and schema correctness.

### Recommended implementation direction
Consider adding:
1. explicit check that generated Prisma client is in sync with schema changes
2. explicit migrate + seed + smoke test path closer to production runtime
3. targeted tests or scripts for schema expectation validation
4. optional separate job focused only on payment/checkout critical path
5. optional branch protection guidance documented in repo

### Constraints
- keep CI duration reasonable
- do not duplicate large work unnecessarily across jobs

### Acceptance criteria
- schema drift that would break checkout is surfaced before merge
- critical payment path regressions are clearly visible in CI
- CI remains maintainable and understandable

### Definition of done
- workflow updated
- any new scripts documented
- unnecessary duplication between jobs minimized

---

## Issue 9 — Review NextAuth + Prisma Adapter + JWT strategy for unnecessary complexity

**Type**: auth / maintainability  
**Priority**: P2  
**Suggested labels**: `auth`, `tech-debt`, `maintainability`

### Problem
The project currently uses `PrismaAdapter(db)` with `session: { strategy: 'jwt' }`. This can be valid, but it is worth verifying whether the adapter is providing enough concrete value to justify the added moving parts for the current product stage.

### Current implementation hotspots
- `src/lib/auth.ts`
- `src/lib/auth-config.ts`
- auth-related schema models in `prisma/schema.prisma`

### Goal
Make an explicit decision: keep the current setup because it is justified, or simplify it if parts are unnecessary.

### Recommended implementation direction
1. audit which adapter-backed features are actually used
2. identify whether DB sessions, OAuth accounts, email verification flows, or future requirements justify current complexity
3. if simplifying, do it incrementally and with zero auth regressions
4. if keeping the architecture, document why

### Constraints
- do not break credential login
- do not break role propagation in JWT/session callbacks
- do not rewrite auth stack casually; this issue is about evidence-based simplification or documentation

### Acceptance criteria
- architecture decision documented
- if code changes are made, auth tests cover login, role propagation, and route authorization behavior

### Definition of done
- either a simplification PR merged or an ADR-style note committed explaining the retained design

---

## Issue 10 — Prepare production hardening checklist for Stripe mode, support workflows, and incident recovery

**Type**: production readiness  
**Priority**: P1  
**Suggested labels**: `production`, `payments`, `operations`, `documentation`

### Problem
The repo already supports mock and Stripe modes, and the README clearly states that some areas are still evolving. Before relying on Stripe mode in production, the team needs a concrete hardening checklist that covers not just code paths but operational readiness.

### Current implementation hotspots
- `README.md`
- `.env.example`
- checkout/payment/webhook modules

### Goal
Create a pragmatic production-readiness checklist focused on payment operations.

### Recommended implementation direction
Document and validate at least:
1. required environment variables and secret rotation process
2. webhook endpoint setup and verification steps
3. replay/reconciliation process for failed or ambiguous payment events
4. support workflow for `PAYMENT_MISMATCH` and retry exhaustion events
5. rollback strategy if payment deploy introduces regressions
6. monitoring and alert recommendations
7. manual verification checklist for staging before live cutover

### Constraints
- keep the checklist specific to this repo, not generic SaaS advice
- tie the checklist to actual code behavior already present

### Acceptance criteria
- there is a concrete production hardening document in `docs/`
- an operator can follow it to validate Stripe mode readiness
- incident-response steps exist for the main payment failure classes already observable in code

### Definition of done
- document committed and linked from README or relevant internal docs

---

## Suggested execution order

1. Issue 5 — resource-level authorization hardening
2. Issue 1 — prevent orphan payment intents
3. Issue 3 — dedicated webhook idempotency store
4. Issue 4 — checkout replay safety
5. Issue 2 — remove runtime schema fallback
6. Issue 6 — structured logs and correlation IDs
7. Issue 8 — stronger CI gates
8. Issue 10 — production hardening checklist
9. Issue 7 — canonical state machine documentation
10. Issue 9 — auth strategy review

## Notes for the agent implementing these issues

- treat checkout, payment, and auth changes as high-risk areas
- prefer focused PRs with regression tests over elegant but wide refactors
- preserve current mock mode unless an issue explicitly says otherwise
- when changing persistence or eventing behavior, document migration and rollback assumptions
