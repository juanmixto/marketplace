---
title: AI Guidelines — contract rules for agents working in parallel
last_verified_against_main: 2026-04-16
---

# AI Guidelines — contract rules for agents working in parallel

> Purpose: keep multiple agents (and humans) from stepping on each other while the repo scales.
> Canonical source. Linked from [`AGENTS.md`](../AGENTS.md) and [`docs/conventions.md`](./conventions.md).
> For hands-on recipes see [`docs/ai-workflows.md`](./ai-workflows.md).

This file describes **what must not drift**. Read [`docs/conventions.md`](./conventions.md) first for the stack-level rules (Prisma, auth, imports that bite) — this file layers architecture rules on top.

---

## 0. Core principles

Order matters when they conflict:

1. **Safety > clarity > speed.** Prefer a small, reversible change over a clever rewrite.
2. **Small, isolated PRs.** One concern per PR. A bug fix is not an invitation to refactor nearby code.
3. **Backward compatibility is the default.** A public signature change is a contract break — treat it as such.
4. **When in doubt, don't modify.** Leave a `TODO(agent-handoff):` comment and surface the ambiguity in the PR description.

---

## 1. Domain architecture

All business logic lives in [`src/domains/`](../src/domains/). Each folder is a **domain** (bounded context): `catalog`, `orders`, `payments`, `shipping`, `subscriptions`, `reviews`, `vendors`, etc.

### 1.1 Public surface of a domain

A module inside `src/domains/<d>/` is **public** (may be imported from outside the domain) if it:

- Lives directly under `src/domains/<d>/` (not inside a sub-folder whose name starts with `_`, `internal`, or `private`).
- Has no `// @internal` JSDoc tag on its top-level exports.
- Is not a Zustand store (`*-store.ts`) — those are client-only and covered by §4.

Everything else is **private to the domain**.

### 1.2 Cross-domain import rules

```ts
// ✅ Allowed — public module of another domain
import { getOrderDetail } from '@/domains/orders/actions'
import { createReview } from '@/domains/reviews/actions'

// ❌ Forbidden — reaching into a private/internal subfolder
import { foo } from '@/domains/orders/internal/price-calc'
import { bar } from '@/domains/orders/_private/helpers'

// ❌ Forbidden — importing a Zustand store from another domain
import { useCartStore } from '@/domains/orders/cart-store' // except from the same domain or explicit client boundaries — see §4
```

> **Today's reality (2026-04-16):** all 18 domains ship an `index.ts` barrel (added in PR #480) that `export *`s from their public files — stores are deliberately excluded. Call sites are a mix: some import from the barrel (`@/domains/orders`), others still use file-level imports (`@/domains/orders/actions`). Both are tolerated today. New code should prefer the barrel; opportunistic migration is welcome but avoid wholesale churn that conflicts with other agents.

### 1.3 Working with barrels

All existing domains ship a barrel. Rule of thumb for agents:

- **New code:** import from the barrel (`import { foo } from '@/domains/orders'`) unless that creates an import cycle.
- **Editing existing call sites:** if the file already imports deep (`@/domains/orders/actions`), don't churn it just to use the barrel — leave it unless you're already modifying that import line.
- **Creating a new domain:** add an `index.ts` barrel from the start. `export *` from the public files; **never** from `*-store.ts` or private subfolders.
- **Adding to an existing barrel:** if you add a new public file to a domain, add an `export *` line to its `index.ts` in the same PR.

### 1.4 No circular dependencies between domains

Use [`scripts/audit-domain-contracts.mjs`](../scripts/audit-domain-contracts.mjs) to detect cycles. A cycle is a design smell — break it by extracting the shared type to `src/types/` or inverting the dependency.

---

## 2. Contracts (internal APIs)

A **contract** is anything one domain exposes that another domain (or the `app/`, `components/`, `lib/` layers) depends on:

- Exported function signatures from a domain module.
- Exported TypeScript types and Zod schemas.
- Server Action input/output shapes.
- Prisma model field names (see [`docs/conventions.md`](./conventions.md) §Prisma).

### 2.1 Breaking a contract

A contract change is **breaking** if it:

- Removes or renames an exported symbol.
- Narrows a function signature (removes an overload, tightens a parameter type, adds a required parameter).
- Changes return type in a way that forces callers to adapt.
- Renames a Zod schema field or makes an optional field required.

### 2.2 What to do instead

1. **Add, don't mutate.** Introduce `fooV2()` alongside `foo()`. Mark `foo()` with `/** @deprecated use fooV2 */`.
2. **Migrate callers in the same PR** — or in a follow-up PR linked in the deprecation comment.
3. **Only remove the old symbol** once every caller has moved. Record the removal in the PR description so reviewers can verify.
4. **Zod schemas:** prefer `.extend()` / new schema variants over mutating the original. If you must rename a field, ship a parser shim for one release.

### 2.3 Non-breaking changes

These are safe and don't need versioning:

- Adding a new exported symbol.
- Adding an *optional* parameter at the end of a signature.
- Widening a return type (as long as the widened type is still assignable where callers use it).
- Adding a new optional field to a Zod schema.

---

## 3. Shared types and schemas

- Project-wide types that are **not** owned by any one domain live in [`src/types/`](../src/types/).
- Domain-owned types live in the domain and are re-exported from the domain's public surface (see §1.1).
- **Do not duplicate** a type that already exists. Before adding, grep for the type name across `src/types/` and `src/domains/*/types.ts`.
- **Runtime boundaries must use Zod.** Any Server Action, API route, or external-input parser must validate with a Zod schema. The parsed type is the source of truth (`type Foo = z.infer<typeof fooSchema>`).
- **Never `any` in domain code.** The only `any` allowed in `src/domains/` today is for Prisma `$queryRaw` / `$executeRaw` escapes, and generated code under `src/generated/`. See the audit script for the allowlist.

---

## 4. Zustand stores (client-only)

Zustand is the only client state library in this repo. Rules:

- **Every store file starts with `'use client'`.** No exceptions.
- **Store files are named `*-store.ts`** (e.g. `cart-store.ts`, `favorites-store.ts`).
- **Stores are NOT re-exported from domain barrels** (`index.ts`). If a component needs a store, it imports the store file directly.
- **Stores are never imported from Server Components, Server Actions, `middleware.ts`, or any file without `'use client'`.** Doing so bundles client code into the server graph and typically surfaces as cryptic hydration errors.
- **Stores should not call server code.** If a store needs data from the server, it receives it via props from a `'use client'` component that got it from a Server Component.

Current stores (as of 2026-04-16):

- [`src/domains/orders/cart-store.ts`](../src/domains/orders/cart-store.ts)
- [`src/domains/catalog/favorites-store.ts`](../src/domains/catalog/favorites-store.ts)
- [`src/components/admin/analytics/useAnalyticsFiltersStore.ts`](../src/components/admin/analytics/useAnalyticsFiltersStore.ts)

---

## 5. Database (Prisma)

See [`docs/conventions.md`](./conventions.md) §Prisma for field-name gotchas. Rules for migrations:

- **Never edit `prisma/schema.prisma` without generating a migration** (`npm run db:migrate` in dev; a reviewer-auditable `prisma/migrations/<ts>_*/migration.sql` in CI).
- **Migrations must be backward compatible across one deploy.** A rename must be done as `ADD new column → dual-write → backfill → switch reads → DROP old`. Never `ALTER COLUMN RENAME` in a single migration if the column is in active use.
- **NOT NULL + DEFAULT on a big table:** add the column nullable, backfill, then set NOT NULL in a follow-up migration.
- **Prisma client is `@/generated/prisma/client`** — never `@prisma/client`.

---

## 6. Imports — enforcement

Enforcement is layered:

1. **[`eslint.config.mjs`](../eslint.config.mjs)** — blocks at lint time. Relevant rules:
   - `@typescript-eslint/no-explicit-any` (errors in `src/**`, off under `test/`, `e2e/`, `scripts/`).
   - `no-restricted-imports` on `src/lib/**` — forbids `@/domains/*/*` deep imports (barrel-only in lib). Added in PR #483 (Phase 4). Limited to `src/lib/` because a wider scope collides with Next.js bundling of barrel re-exports into client bundles; the barrel-split into server/client halves is the prerequisite for app-wide enforcement.
   - `no-restricted-imports` on `src/**` — forbids cross-domain reaches into `@/domains/*/internal/*`, `@/domains/*/_*/**`, `@/domains/*/private/*`.
   - Runs in CI via `npm run lint`.
2. **[`scripts/audit-domain-contracts.mjs`](../scripts/audit-domain-contracts.mjs)** — covers dynamic checks that static lint can't express cleanly:
   - Domain-level dependency cycles (A imports B imports A transitively).
   - `*-store.ts` pulled into the server graph (files without `'use client'`).
   - Belt-and-braces sweep for `any` in `src/domains/` with an explicit allowlist.
   Run locally with `npm run audit:contracts`. Flags: `--soft` (always exit 0), `--json` (machine-readable).
3. **Code review** — rules this document can express normatively but tooling cannot (e.g. "don't add abstractions for hypothetical futures", scope discipline).

The **cross-domain store rule** is intentionally in the audit script rather than ESLint: stores may legitimately be imported from client components outside the owning domain, and the `'use client'` signal that distinguishes valid from invalid imports is easier to check dynamically than with a static glob.

---

## 7. Development philosophy for agents

- **Scope discipline.** A bug fix does not bundle "while I'm here" cleanups. Cleanups get their own PR.
- **Don't add abstractions for hypothetical futures.** Three similar lines beat a premature helper.
- **Don't leave half-implemented features.** If a change cannot land cleanly, open an issue and *revert*, don't commit a fragment.
- **Hidden constraints deserve a comment.** If a line exists to work around a subtle bug or upstream quirk, say so in a short comment. Otherwise skip comments — well-named identifiers do the job.
- **If another agent's WIP is in the worktree, stop and ask.** See [`AGENTS.md`](../AGENTS.md) §"Concurrent-agent safety".

---

## 8. Checklist before opening a PR

- [ ] No cross-domain import into `internal/`, `_private/`, or `_*/`.
- [ ] No cross-domain import of a `*-store.ts`.
- [ ] No new `any` in `src/domains/` (except in the audit allowlist).
- [ ] If a Prisma schema changed: a migration file was generated and is backward compatible.
- [ ] If a public contract (exported function / Zod schema / Prisma field) changed: either non-breaking, or versioned with deprecation per §2.2.
- [ ] Ran `npm run lint` — clean (blocks on the `no-restricted-imports` rule).
- [ ] Ran `npm run audit:contracts` — no new violations introduced.
- [ ] Ran `npm run typecheck` — clean.
- [ ] PR description lists any contract changes and whether they are breaking.

---

## 9. Roadmap / open items

Tracked so the next agent doesn't re-discover them:

- **`eslint-plugin-boundaries`** — installed (dep present in `package.json`) but not yet wired into [`eslint.config.mjs`](../eslint.config.mjs). Wiring it would enable declarative domain-to-domain allow-lists beyond what `no-restricted-imports` covers. Defer until the barrel server/client split lands.
- **App-wide barrel-only enforcement** — PR #483 landed enforcement for `src/lib/ → @/domains/<d>/*` only. Extending to `src/domains/`, `src/app/`, and `src/components/` requires first splitting each domain barrel into server + client halves (`index.ts` + `index.client.ts`) so Next.js doesn't bundle server-only code into client chunks. That refactor is its own PR.
- **Per-domain schema freeze tests** — [`test/contracts/`](../test/contracts/) (plural) already exists and covers global invariants (i18n parity, dark mode, a11y, SEO, etc. — see its [`README.md`](../test/contracts/README.md)). Not yet populated: snapshot-style tests that freeze the shape of a domain's exported Zod schemas so a silent rename/removal fails CI. Recommended when a domain's public surface stabilises.
