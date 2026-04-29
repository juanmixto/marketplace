# Business test strategy

_Last reviewed: 2026-04-29_

How we keep the **flows that generate revenue** working. Companion to
[`docs/ci-testing-strategy.md`](../ci-testing-strategy.md): that one
covers CI mechanics, this one covers what we test and why.

## TL;DR

- Three layers, not four. Unit (`test/features/`), DB-integration
  (`test/integration/`), end-to-end (`e2e/smoke/`).
- A test earns its place in the smoke gate **only** if a regression
  in that flow loses real money or breaks buyer trust. Everything
  else lives lower in the pyramid.
- Seeded users are the contract. New tests reuse
  `cliente@test.com` / `productor@test.com` / `admin@marketplace.com`
  rather than minting fixtures per file.

## Coverage matrix

Mapped to the business priorities in [`AGENTS.md`](../../AGENTS.md):
**confianza · checkout móvil · onboarding productor · medición · operaciones**.

| Flow | Risk if it breaks | Where covered | Layer |
|---|---|---|---|
| Buyer login (password) | Funnel collapse | `e2e/auth.spec.ts` | E2E |
| Buyer login (Google) | Funnel collapse | `e2e/smoke/auth-social-roundtrip.spec.ts`, `auth-social.spec.ts` | E2E |
| Browse catalog | First impression / trust | `e2e/smoke/public-browse.spec.ts` | E2E |
| **Catalog filter narrows results** | Buyer can't find product → bounce | `e2e/smoke/catalog-filter.spec.ts` | E2E |
| Product detail | Confidence in the SKU | `e2e/smoke/public-browse.spec.ts` | E2E |
| Add to cart, single vendor | Lost order | `e2e/smoke/cart-checkout.spec.ts` | E2E |
| **Add to cart, multi-vendor** | Lost mixed orders, silent | `e2e/smoke/multi-vendor-cart.spec.ts` | E2E |
| **Cart survives anonymous → login** | Top abandonment point at signup | `e2e/smoke/cart-hydration-login.spec.ts` | E2E |
| Checkout (mock provider) | Lost order | `e2e/smoke/cart-checkout.spec.ts` | E2E |
| Checkout idempotency | Double-charge / double-order | `test/integration/checkout-idempotency*.test.ts` | Integration |
| Order persistence | Phantom orders | `test/integration/order-create.test.ts`, confirmation page assertion in cart smoke | Integration + E2E |
| Stripe webhook → order | Payment confirmed but order not progressed | `test/integration/stripe-webhook*.test.ts` | Integration |
| Stock concurrency | Overselling | `test/integration/stock-concurrency.test.ts` | Integration |
| Vendor product CRUD | Producer can't list | `e2e/smoke/vendor-product-crud.spec.ts` | E2E |
| Vendor cross-vendor isolation | Producer A reads B's data | `test/integration/vendor-cross-vendor-isolation.test.ts` | Integration |
| Admin guards | Privilege escalation | `e2e/smoke/admin-guards.spec.ts` | E2E |
| Admin orders / users / products | Operations break | `test/features/admin-*.test.ts`, `test/integration/orders-auth-audit.test.ts` | Unit + Integration |
| Incidents (buyer + refund) | Trust collapse on dispute | `test/integration/incidents-buyer.test.ts`, `incident-refund.test.ts` | Integration |
| Buyer / vendor / admin role separation | Cross-role action unauthorized | `test/integration/api-incidents-auth.test.ts` (+ `audit:authz`) | Integration |

The three rows in **bold** are added by this strategy doc; the rest
already existed before 2026-04-29.

## When does a flow earn an E2E smoke?

A new spec under `e2e/smoke/*` is justified **only** if all four hold:

1. **The break is invisible without it.** If a server unit test
   already catches the bug class, an E2E adds cost, not signal.
2. **The user-visible failure is silent.** Bugs that throw a 500 page
   are caught by error tracking; the smoke gate's job is to catch
   bugs that succeed cosmetically but lose business value (cart that
   silently empties, filter that silently returns everything, order
   confirmation that silently shows the wrong total).
3. **The flow runs daily on real traffic.** Smokes are for the hot
   path. Edge flows (impersonation, refund disputes) belong in
   integration so they don't widen the merge-blocking budget.
4. **It costs us less than 30s on the shard.** If the spec needs
   multi-page navigation that pushes the shard above 30s wall-clock,
   either trim it or move pieces to integration.

If any of the four is "no", the test belongs **below** the smoke
layer. Use `test/integration/*` for DB-backed business logic and
`test/features/*` for pure-function units.

## Stable selectors

E2E specs prefer, in order:

1. `getByRole(...)` with a Spanish-language accessible name —
   matches what users actually read.
2. `data-testid` for elements where the role/name is ambiguous or
   where copy churns (saved-address row, action menus, banners).
3. `name=` selectors on form inputs (react-hook-form `register`).

What we **don't** use:

- Class-name selectors (`.btn-primary`).
- Deeply nested CSS selectors (`form > div > button:nth-child(2)`).
- Text matchers tied to marketing copy unless wrapped in a
  permissive regex (`/comprar|añadir/i`).

The current `data-testid` registry lives in
`src/components/**/*.tsx`. New IDs go in close to the element
they identify; never on a wrapper. List of IDs added through this
doc:

- (none yet — added on demand as new specs need them)

## Fixtures and seed data

Seed lives in `prisma/seed.ts`. The contract:

- Three named users, stable emails, stable passwords. **Do not** add
  per-test users — flake risk + cleanup risk.
- Five seeded vendors covering the categories `verduras`,
  `frutas/miel`, `lacteos`, `aceites/vinos`, `panaderia`. New tests
  pick from these slugs rather than introducing new vendors.
- Stock per seeded product is ≥ 10. New specs that consume stock
  must keep `quantity = 1` unless they also bump the seed.

If a test needs data that doesn't fit the seed, prefer a Prisma
factory in `test/integration/helpers.ts` over a one-off seed entry.

## Running tests

| Goal | Command |
|---|---|
| All unit tests, parallel | `npm run test:parallel` |
| Integration (needs DB up) | `npm run test:integration` |
| E2E smoke only (PR gate) | `npm run test:e2e:smoke` |
| Full E2E (nightly) | `npm run test:e2e` |
| Typecheck tests | `npm run typecheck:test` |

For E2E: Playwright auto-starts `next dev` on `:3001` and points it
at `DATABASE_URL_TEST` (default `marketplace_test`). The DB must
already exist; migrations apply via `predev`. Seed runs in CI; for
local runs, `npm run db:seed` once after `db:reset`.

## CI integration

PR-blocking jobs (defined in `.github/workflows/ci.yml`):

- **Verify** — lint, typecheck, unit tests.
- **Build And Migrate** — `next build` + Prisma schema sync.
- **E2E Smoke** — sharded Playwright, all `@smoke` specs.

Integration tests run **after** merge to `main`, sharded 16-way.
This is intentional: DB-backed specs are the slowest layer; gating
them on PRs would punish docs-only / typo-only changes. The trade
is that a regression in DB integration surfaces post-merge —
acceptable as long as we keep `Verify` and `E2E Smoke` honest.

The `audit:authz` script (`scripts/audit-authz-coverage.mjs`)
enforces the cross-tenant negative-test registry described in
[`docs/authz-audit.md`](../authz-audit.md). New server actions
that touch tenant-scoped data MUST add at least one negative
test, and `audit:authz` runs in `Verify`.

## Known gaps (open issues)

Tracked rather than implemented (each fails AGENTS.md "Hacer / No
hacer" rule #1: **the break has no measurable cost yet**, so we
defer until traction makes the cost real):

- [#1033](https://github.com/juanmixto/marketplace/issues/1033) —
  Vendor publishes a draft product → buyer sees it in storefront.
  `vendor-product-crud.spec.ts` stops at draft today.
- [#1034](https://github.com/juanmixto/marketplace/issues/1034) —
  Email verification flow E2E (only integration-level today).
- [#1035](https://github.com/juanmixto/marketplace/issues/1035) —
  Admin incident triage UI (list → assign → resolve) E2E.
- [#1036](https://github.com/juanmixto/marketplace/issues/1036) —
  Expand `data-testid` coverage in admin / incident / fulfillment UIs,
  added alongside the specs that consume them.

When opening a PR that touches one of these surfaces, consider
whether your change moves the cost-to-fail high enough to promote
the gap from "issue" to "smoke".
