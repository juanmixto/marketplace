# CI & Testing Strategy

_Last reviewed: 2026-04-15_

This document defines how CI runs, how tests are organised, and what the
pyramid should look like going forward. It is the source of truth — if
this file and a workflow disagree, the workflow is wrong.

## 1. Goals

1. **Fast feedback on PRs** — merge-blocking checks should finish in under
   ~8 minutes wall-clock for a non-trivial change.
2. **High confidence before merge** — the main critical flows (auth,
   cart, checkout, vendor CRUD, admin guards) must be exercised
   end-to-end on every PR, not only in nightly.
3. **Low noise** — flaky tests are treated as bugs. A spec that flakes
   twice in a week gets quarantined (skipped with a tracking issue) the
   same day it is noticed.
4. **Low cost** — no matrix over Node versions, no sharding, no visual
   regression, no test-impact analysis until we measurably outgrow the
   current approach.

## 2. Pipeline topology

Three workflows:

| Workflow | Trigger | Jobs | Blocking? |
|---|---|---|---|
| `ci.yml` | push to `main`, PRs | `verify`, `build`, `integration`, `e2e-smoke` | Yes (smoke currently `continue-on-error: true` — see §6) |
| `nightly.yml` | cron `17 3 * * *`, manual | `full-e2e`, `coverage-trend`, `security-audit` | No (alerts on failure) |
| _release.yml_ | n/a | n/a | Not implemented — project is trunk-based without formal releases. |

`ci.yml` has `paths-ignore` for `**/*.md`, `docs/**`, `.vscode/**`,
`LICENSE`, `.gitignore`. Docs-only PRs skip CI entirely.

### Why no per-node matrix?

The project pins Node 22 in `.github/actions/setup-deps/action.yml`. We
deploy to exactly one Node version and do not ship a library. A matrix
would double CI cost with zero signal.

### Why all four jobs run in parallel (no `needs:`)?

All four depend only on `setup-deps`, which is cached. Serialising them
would add ~15 min to wall-clock for no benefit. `e2e-smoke` uses
Playwright's `webServer` to boot `next dev` against the test DB — it
does not need the production `.next` build from the `build` job.

### Why `next dev` and not `next start` for E2E?

`next dev` is what the current `playwright.config.ts` already uses and
what the existing `auth.spec.ts` is battle-tested against. Moving to
`next start` would catch a few extra prod-mode bugs (minification,
caching, SSR edge cases) but requires starting the server manually in
CI and waiting for readiness — more moving parts, more flake surface.
Keep dev mode for Phase 1, revisit in Phase 2 if real prod-only bugs
slip through.

## 3. Test pyramid — current state and target

| Layer | Location | Runner | Count (2026-04-15) | Target |
|---|---|---|---|---|
| Contracts (invariants) | `test/contracts/` | `node --test` via `scripts/run-node-tests.mjs` | 25 | **stay at 25**. Do not add. |
| Features / unit | `test/features/` | same | 62 | 60–80. Grows with features. |
| Integration (DB-backed) | `test/integration/` | `scripts/run-integration-tests.mjs` (serial) | 22 | 25–30. See §5 for gaps. |
| E2E smoke (`@smoke`) | `e2e/` | Playwright, chromium, 2 workers | 1 file / 4 tests | **5–7 specs**. See §5. |
| E2E full | `e2e/` | Playwright, nightly | ≈ smoke | 12–15 specs (Phase 2). |
| Visual regression | — | — | 0 | **0.** Not justified. |
| A11y | `test/contracts/` partial | node | partial | Add `@axe-core/playwright` to 2 smoke specs in Phase 2. |
| Security | — | — | 0 | `npm audit --audit-level=high` in nightly. |

### What is already enough

- **Contracts**: 25 specs covering dark-mode, i18n parity, accessibility,
  performance invariants, brand consistency. This layer is _done_.
  New contracts are rarely worth the maintenance cost — use a lint rule
  or a type if possible.
- **Features**: ratio vs source files is healthy. Authors should keep
  adding feature tests alongside new code, but there is no systematic
  gap to fill.

### What is visibly under-covered

- **End-to-end reality**. The only E2E spec is auth. Anything that
  requires SSR + client hydration + server actions + DB round-trip is
  effectively not tested as a flow, only in isolated pieces.
- **Stripe webhook idempotency**. A replayed `payment_intent.succeeded`
  must not double-create orders. This is integration, not E2E.
- **Admin audit log side-effects**. Admin mutations should write an
  audit row; no test currently asserts this.

## 4. What to parallelise (and what not to)

| Thing | Decision |
|---|---|
| `verify` / `build` / `integration` at job level | ✅ Parallel. Already. |
| Typecheck (`app` + `test`) + unit tests inside `verify` | ✅ Parallel via bash `&`/`wait`. Fine for this size; do not over-engineer. |
| Node test runner internal concurrency | ✅ `--test-concurrency=8`. Raising higher is wasted — these tests are fast. |
| `test/integration/*` (DB-backed) | ❌ **Serial.** `--test-concurrency=1`. All 22 share one Postgres instance and would race each other. Parallelising requires one DB per worker (template + `CREATE DATABASE` or schema-per-worker), which is ~1 day of work for the 22 tests we have. Revisit when this layer exceeds 40 tests or takes >8 min. |
| Playwright | ✅ `fullyParallel: true`, `workers: 2` in CI. Same constraint as integration — shared seeded DB. Going above 2 needs data isolation. |
| Playwright sharding across runners | ❌ Not worth it until we exceed ~30 specs. |

## 5. Concrete tests to add

### Phase 1 — E2E smoke (this is where the risk is)

Create under `e2e/smoke/`. All specs must be tagged `@smoke` in the
`describe` block to be picked up by `npm run test:e2e:smoke`.

| File | Covers | Why it blindan the project |
|---|---|---|
| `e2e/smoke/public-browse.spec.ts` | Home → catalog → product detail renders | Catches SSR/hydration regressions that no unit test can see |
| `e2e/smoke/cart-checkout.spec.ts` | Add-to-cart → checkout with `PAYMENT_PROVIDER=mock` → order created | Blindan el flujo de pago, el más caro de romper |
| `e2e/smoke/vendor-product-crud.spec.ts` | Vendor login → create product → edit → delete | Blindan panel vendor; flujo con muchas server actions |
| `e2e/smoke/admin-guards.spec.ts` | buyer→`/admin/*` = 403, vendor→`/admin/*` = 403 | Regresiones de permisos — un bug aquí es un incidente de seguridad |
| `e2e/auth.spec.ts` _(existing, tagged `@smoke`)_ | Login, wrong creds, anonymous guards | Already covered |

**Do not** add smoke specs for: individual form validations (Zod does
this at the type level), dark mode (contracts cover it), i18n strings
(contracts cover it), admin dashboards (too flaky, too broad).

### Phase 2 — Integration gaps

| File | What |
|---|---|
| `test/integration/stripe-webhook-idempotency.test.ts` | Same `event_id` delivered twice ⇒ single order |
| `test/integration/admin-audit-log.test.ts` | Admin mutations write audit rows with expected shape |
| `test/integration/vendor-promotions-lifecycle.test.ts` | Create → activate → expire a promotion, price reflected in catalog |

## 6. Promoting `e2e-smoke` to required

`e2e-smoke` currently runs with `continue-on-error: true`. Promotion
criteria:

1. 3 consecutive green runs on `main` with the full Phase-1 smoke suite.
2. Zero flakes in the last 10 PR runs (retries allowed once — `retries: 2` is
   already set in `playwright.config.ts`).
3. When both conditions are met, remove `continue-on-error: true` from
   `.github/workflows/ci.yml` and add `e2e-smoke` to the branch
   protection required checks.

Until then, smoke failures are visible but do not block merges. A flake
that takes longer than one day to fix must be quarantined via
`test.skip` + a linked issue — never `xit`-style commented out.

## 7. Folder conventions

```
test/
  contracts/        invariants that must always hold (no DB, no network)
  features/         unit + feature tests (no DB)
  integration/      DB-backed tests, one DB shared, run serially
  test-helpers.ts   custom matcher wrappers around node:assert
e2e/
  auth.spec.ts      legacy location, kept for now
  smoke/            Phase 1 specs, all tagged @smoke
  helpers/          page object models, login helpers, fixtures
```

New tests go in the deepest layer that can still provide the signal.
Prefer integration over E2E for anything that doesn't require a browser.

## 8. Scripts

| Script | Use |
|---|---|
| `npm test` | Contracts + features, serial. Fast local iteration. |
| `npm run test:parallel` | Same, with `--test-concurrency=8`. CI default on PRs. |
| `npm run test:coverage` | Same + c8. CI on push-to-main. |
| `npm run test:integration` | Integration layer, serial, requires `DATABASE_URL_TEST`. |
| `npm run test:db:parallel` | **Misleading name.** In practice applies Prisma migrations to the test DB. Kept for backwards compat — do not rename without updating `ci.yml`. |
| `npm run test:e2e` | Full Playwright suite. Nightly. |
| `npm run test:e2e:smoke` | Only specs tagged `@smoke`. PR CI. |

## 9. Known trade-offs

- **`test:db:parallel` is a misnomer** (it runs migrations, not tests).
  Renaming it touches three files and has no runtime benefit. Left as
  is, documented here. See
  [`scripts/run-node-tests.mjs:24-40`](../scripts/run-node-tests.mjs#L24-L40).
- **Playwright uses one seeded DB shared by 2 workers.** If two specs
  mutate the same rows, they will race. Today this is fine because the
  smoke suite does mostly reads. Phase 2 must adopt a per-worker data
  strategy (fixtures that create isolated users / products).
- **No visual regression.** Pixel tests on Tailwind + dark mode + i18n
  would need per-locale, per-theme baselines — we would spend more time
  approving screenshots than shipping features.
- **No test impact analysis.** The installation and Prisma generate
  steps dominate wall-clock. Skipping tests would not move the needle.
- **`continue-on-error` on `e2e-smoke`** makes flakes visible but not
  blocking. This is intentional for the first ~2 weeks. Section 6
  defines when to flip it.

## 10. Expected impact

Rough, qualitative, pre/post this redesign (cold cache):

| Scenario | Before | After |
|---|---|---|
| Docs-only PR | ~10 min (full CI) | **~0 min** (skipped by `paths-ignore`) |
| Normal PR (no E2E before) | ~10 min (longest job) | ~10 min (smoke runs in parallel, hidden inside wall-clock) |
| Normal PR (Playwright browsers cache warm) | — | ~10 min |
| Nightly full suite | not run | ~25 min |
| Confidence in merge | _low for end-to-end flows_ | _high for the 5 critical flows_ |

Trade-off accepted: PRs get ~2 min slower on a warm cache in exchange
for end-to-end coverage of the flows that actually break in production.
