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

## Pre-commit hook (gitleaks)

The repo ships a [pre-commit](https://pre-commit.com) config that runs
`gitleaks` on every staged change. CI (`security-scan.yml`) catches
committed secrets too, but only after they reach the remote — by then
the leak is already public history. The local hook stops them before
the commit lands.

One-time install per worktree:

```bash
pip install pre-commit   # or: pipx install pre-commit / brew install pre-commit
pre-commit install
```

Verify it works (uses a fake-shaped key that does not authenticate against
Stripe — gitleaks matches the prefix shape, not the validity):

```bash
printf 'STRIPE_SECRET_KEY=sk_live_%s\n' "$(openssl rand -hex 12)" > /tmp/leak.env
git add -f /tmp/leak.env && git commit -m 'leak'   # should refuse
```

## Pull requests

Before opening a PR:

1. Make sure migrations are committed when the Prisma schema changes.
2. Update docs when commands or workflows change.
3. Fill in the PR template with the checks you actually ran.
