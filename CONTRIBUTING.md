# Contributing

## Local validation

Run the checks that match the area you touched:

- `npm run typecheck:app`
- `npm run typecheck:test`
- `npm run test:parallel`
- `npm run test:db`
- `npm run build`

For a quick pass before opening a PR, this is the usual minimum:

```bash
npm run typecheck:app
npm run test:parallel
npm run build
```

If your change touches Prisma models, server actions, checkout, stock, auth, or settlements, also run:

```bash
npm run typecheck:test
npm run test:db
```

If you touched public catalog, auth, or checkout flows, also run:

```bash
npm run test:e2e:smoke
```

That smoke suite is wired to the seeded `marketplace_test` database and
sets `PLAYWRIGHT_E2E=1` so it bypasses app caches during repeat runs.
For a manual smoke-matching boot, use `./dev.sh --smoke`.

## Test split

- `npm test`: fast tests without database dependencies
- `npm run test:parallel`: same fast suite with Node test concurrency enabled
- `npm run test:db`: database-backed tests, applies Prisma migrations first
- `npm run test:integration`: integration tests against the test database

## Pull requests

Before opening a PR:

1. Make sure migrations are committed when the Prisma schema changes.
2. Update docs when commands or workflows change.
3. Fill in the PR template with the checks you actually ran.
