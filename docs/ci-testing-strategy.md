# CI & Testing Strategy

_Last reviewed: 2026-04-18_

This document explains how CI is meant to behave and how to choose the right test layer for a change. If a workflow disagrees with this file, the workflow is the bug.

## Goals

1. Fast feedback on PRs.
2. High confidence on the checkout, auth, and admin-critical paths.
3. Low noise: flaky tests are bugs, not a normal state.
4. Low cost: keep the pipeline simple until there is a clear reason to expand it.

## Current pipeline shape

- `ci.yml` runs on pushes to `main` and on PRs.
- `nightly.yml` runs on a schedule and can carry the heavier checks.
- Docs-only PRs can skip CI when the workflow `paths-ignore` covers them.
- The repo is trunk-based; there is no release branch workflow.

## What to run in CI

- `verify`
- `build`
- `integration`
- `e2e-smoke`

The exact implementation can change, but the rule stays the same: keep the critical checks in CI and keep them reliable.

## Test layers

| Layer | Location | What it is for |
|---|---|---|
| Contracts | `test/contracts/` | Invariants that should almost never change |
| Features / unit | `test/features/` | Small, fast behavior tests |
| Integration | `test/integration/` | DB-backed flows and webhook behavior |
| E2E smoke | `e2e/` | The browser flows that matter most |

## How to choose the right layer

- Use contracts for repo-wide invariants, snapshot-style shape checks, and rules that should not drift.
- Use features/unit tests for local logic that does not need a browser or database.
- Use integration tests for anything that needs the database, webhook delivery, or multi-step server behavior.
- Use E2E smoke only for the flows that truly need the browser.

## What should stay in CI

- Authentication guards
- Public browse and catalog flows
- Cart and checkout
- Vendor CRUD and fulfillment
- Admin route protection
- Stripe and webhook idempotency

## What should not become smoke tests

- Single-field form validation
- i18n string presence
- Dark mode details
- Pure rendering of isolated UI fragments
- Non-critical admin dashboards

Those belong in unit, feature, or contract tests instead.

## Commands

| Command | Purpose |
|---|---|
| `npm run test` | Fast tests without DB |
| `npm run test:parallel` | Fast tests with Node concurrency |
| `npm run test:db` | DB-backed tests |
| `npm run test:integration` | Integration suite |
| `npm run test:e2e:smoke` | Smoke browser suite |
| `npm run typecheck` | Full TypeScript check |
| `npm run lint` | ESLint |
| `npm run audit:contracts` | Domain and contract checks |

## Practical defaults

- For small copy or UI changes, start with `typecheck`, `lint`, and the relevant test slice.
- For Prisma, auth, checkout, subscriptions, promotions, or shipping changes, include DB-backed tests.
- For browser-visible flows, include the smoke spec that covers the user journey end to end.

## Known trade-offs

- No visual regression suite.
- No Node version matrix.
- No test-coverage gate that blocks PRs.
- Keep the system simple until there is enough product pressure to justify more complexity.
