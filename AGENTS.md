<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Conventions

- **Project conventions (stack, imports, Prisma fields, server-action pattern)** — see [`docs/conventions.md`](docs/conventions.md). Read this before implementing any ticket.
- **AI guidelines (contract rules, domain boundaries, enforcement)** — see [`docs/ai-guidelines.md`](docs/ai-guidelines.md). Rules for parallel agents. Enforced by [`scripts/audit-domain-contracts.mjs`](scripts/audit-domain-contracts.mjs).
- **AI workflows (recipes)** — see [`docs/ai-workflows.md`](docs/ai-workflows.md) for how to add a feature, refactor safely, or change a contract.
- **i18n** — see [`src/i18n/README.md`](src/i18n/README.md) for when to use flat keys vs `*-copy.ts` modules and the `labelKey` server pattern.
- **Git workflow (trunk-based, branch prefixes, hygiene)** — see [`docs/git-workflow.md`](docs/git-workflow.md). `main` is the only long-lived branch; no `integration/*`, `develop`, `next`. Run `scripts/git-hygiene.sh` periodically.
- **PWA (service worker, manifest, install prompts, offline fallback, cache allow-list)** — see [`docs/pwa.md`](docs/pwa.md). Required reading before touching `public/sw.js`, `src/app/manifest.ts`, or anything under `src/components/pwa/`. The SW has a strict denylist (`/api`, `/admin`, `/vendor`, `/checkout`, `/auth`) that must never be weakened.
- **Payment incidents runbook (checkout + webhook log events, investigation recipes)** — see [`docs/runbooks/payment-incidents.md`](docs/runbooks/payment-incidents.md). Read before renaming any `checkout.*` or `stripe.webhook.*` log scope; oncall queries depend on them.
- **Checkout idempotency (`checkoutAttemptId`, double-submit dedupe, replay UX)** — see [`docs/checkout-dedupe.md`](docs/checkout-dedupe.md). Required reading before changing `createOrder` / `createCheckoutOrder` signatures or the `Order.checkoutAttemptId` UNIQUE constraint.

## Concurrent-agent safety

Multiple agents (or a human + agent) may be active in this repo at the same time. **Before touching a worktree, run `git status`. If you see uncommitted changes that are not yours, stop and ask** — those may be another agent's WIP. Never `git stash` somebody else's working tree to "make room". This is a direct lesson from the 2026-04-12 hygiene incident; see [`docs/git-workflow.md`](docs/git-workflow.md) for the full policy.
<!-- END:nextjs-agent-rules -->
