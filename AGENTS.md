<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Conventions

- **Project conventions (stack, imports, Prisma fields, server-action pattern)** — see [`docs/conventions.md`](docs/conventions.md). Read this before implementing any ticket.
- **i18n** — see [`src/i18n/README.md`](src/i18n/README.md) for when to use flat keys vs `*-copy.ts` modules and the `labelKey` server pattern.
- **Git workflow (trunk-based, branch prefixes, hygiene)** — see [`docs/git-workflow.md`](docs/git-workflow.md). `main` is the only long-lived branch; no `integration/*`, `develop`, `next`. Run `scripts/git-hygiene.sh` periodically.

## Concurrent-agent safety

Multiple agents (or a human + agent) may be active in this repo at the same time. **Before touching a worktree, run `git status`. If you see uncommitted changes that are not yours, stop and ask** — those may be another agent's WIP. Never `git stash` somebody else's working tree to "make room". This is a direct lesson from the 2026-04-12 hygiene incident; see [`docs/git-workflow.md`](docs/git-workflow.md) for the full policy.
<!-- END:nextjs-agent-rules -->
