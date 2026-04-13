# `test/integration/`

Tests that touch the real database, run a full HTTP/Stripe handler end-to-end, or coordinate multiple modules in a way that cannot be mocked safely.

A test belongs here if it needs a Postgres instance to run. CI provides one via `DATABASE_URL_TEST` and the `Integration` job (see `.github/workflows/ci.yml`).

## Runner

These files are executed by `scripts/run-integration-tests.mjs` via:

```
npm run test:integration
```

The fast (non-DB) suite (`scripts/run-node-tests.mjs`) explicitly excludes this folder.

## Adding a new integration test

1. Use `test-helpers.ts` (one level up) for shared fixtures and setup helpers.
2. Apply migrations from `prisma/migrate deploy` before the tests run — the runner already does this.
3. Tests should clean up after themselves so the run order doesn't matter.
4. Keep the file count proportional to the cost — every file here lengthens CI. If a test can be expressed as a unit/feature test with mocks, prefer that.
