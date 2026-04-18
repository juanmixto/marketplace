# `e2e/` — Playwright end-to-end tests

End-to-end tests covering critical marketplace flows. Complements the contract / feature / integration suites in `test/` (#231).

## Running locally

These tests need:

1. A Postgres database with migrations applied and the seed loaded:
   ```bash
   export DATABASE_URL_TEST=postgresql://...
   npx prisma migrate deploy
   npm run db:seed
   ```
2. Chromium installed by Playwright (one-time):
   ```bash
   npx playwright install chromium --with-deps
   ```
3. Then:
   ```bash
   npm run test:e2e
   ```
   Playwright will boot `npm run dev` against `DATABASE_URL_TEST` and run the suite. Pass `E2E_BASE_URL=...` to point at an already-running server instead.
   For a manual smoke-matching boot, use `./dev.sh --smoke`.

## Test users (seeded)

| Email | Password | Role |
|---|---|---|
| `cliente@test.com` | `cliente1234` | CUSTOMER |
| `productor@test.com` | `vendor1234` | VENDOR |
| `admin@marketplace.com` | `admin1234` | SUPERADMIN |

These come from `prisma/seed.ts`. Tests should treat them as read-only — never mutate their state in ways that other tests depend on.

## Conventions

- One `*.spec.ts` per critical flow (auth, checkout, vendor onboarding, admin moderation).
- Reusable login / signup / checkout helpers go in `e2e/helpers/`.
- Tests should clean up anything they created — order, product, address — in an `afterEach` so the DB stays seedable for re-runs.
- Use `page.goto('/...')` (relative) so `baseURL` from `playwright.config.ts` controls the target.

## Status

Initial scaffold landed in #41. Future PRs should add:

- `e2e/checkout.spec.ts` — full mock-payment flow
- `e2e/vendor-onboarding.spec.ts` — vendor signup → product creation → review submission
- `e2e/admin-moderation.spec.ts` — vendor + product approval

CI integration (a Playwright job in `.github/workflows/ci.yml`) is also a follow-up — see #41 for the full task list.
