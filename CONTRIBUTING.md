# Contributing

## Before you start

- Read [`AGENTS.md`](./AGENTS.md) first.
- Then read [`docs/conventions.md`](./docs/conventions.md) and [`docs/ai-guidelines.md`](./docs/ai-guidelines.md) if your change touches code that other areas depend on.
- If the worktree already has uncommitted changes you did not create, stop and ask before editing that file.

## Local validation

Run the smallest set of checks that still covers the area you touched:

- `npm run typecheck:app`
- `npm run typecheck:test`
- `npm run test:parallel`
- `npm run test:db`
- `npm run test:integration`
- `npm run build`

Usual minimum before a small UI or copy change:

```bash
npm run typecheck:app
npm run test:parallel
npm run build
```

If you touch Prisma models, server actions, checkout, auth, stock, subscriptions, promotions, shipping, or settlements, also run:

```bash
npm run typecheck:test
npm run test:db
```

## Test split

- `npm run test` - fast tests without database dependencies
- `npm run test:parallel` - the same suite with Node concurrency enabled
- `npm run test:db` - database-backed tests; applies Prisma migrations first
- `npm run test:integration` - integration tests against the test database
- `npm run test:e2e:smoke` - browser smoke coverage for the critical flows

## Pull requests

Before opening a PR:

1. Commit migrations when the Prisma schema changes.
2. Update docs when commands, workflows, routes, or contracts change.
3. Mention which checks you ran in the PR description.
4. If a contract changed, say whether it was breaking.
