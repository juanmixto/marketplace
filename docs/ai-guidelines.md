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

> **Today's reality (2026-04-16):** no domain ships a barrel `index.ts`. The cross-domain import surface is *file-level* (e.g. `@/domains/orders/actions`). That is the current convention documented in [`docs/conventions.md`](./conventions.md). The rule above formalises that surface rather than forcing a retrofit to barrels.

### 1.3 When a barrel (`index.ts`) exists

If a domain ships an `index.ts`, it becomes the **only** legal entry point for that domain from outside. Deep file imports from that domain become forbidden. Rule of thumb for agents:

- **Creating a new domain?** Add an `index.ts` barrel and re-export only the stable public surface (no stores, no `// @internal` symbols).
- **Migrating an existing domain to a barrel?** Land the barrel + every call-site update in the **same PR**. Do not leave the repo in a mixed state.

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

The project does not currently ship ESLint (see §9 for the roadmap). Until it does, the enforcement mechanism is:

1. **This document** — normative.
2. **[`scripts/audit-domain-contracts.mjs`](../scripts/audit-domain-contracts.mjs)** — reports violations. Run locally with `node scripts/audit-domain-contracts.mjs` or in CI.
3. **Code review** — reviewers (human or agent) reject PRs that violate these rules.

Violations that the audit script flags today:

- Deep imports into a future `internal/`, `_private/`, or `_*/` subfolder of a domain.
- Cross-domain import of a `*-store.ts` file.
- Uses of `any` in `src/domains/` outside the allowlist.

When ESLint is adopted, the target rules will be:

```jsonc
// .eslintrc — target, not currently installed
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [
        {
          "group": ["@/domains/*/internal/*", "@/domains/*/_*/**"],
          "message": "Private modules of a domain are not importable from outside the domain. See docs/ai-guidelines.md §1."
        },
        {
          "group": ["@/domains/*/**-store", "@/domains/*/*-store.ts"],
          "message": "Zustand stores must be imported from the same domain, not cross-domain. See docs/ai-guidelines.md §4."
        }
      ]
    }]
  }
}
```

> The pattern above is the **target**. When ESLint lands, the owner of that PR should validate it against the current import graph (the audit script's report is a useful starting point).

---

## 7. Development philosophy for agents

- **Scope discipline.** A bug fix does not bundle "while I'm here" cleanups. Cleanups get their own PR.
- **Don't add abstractions for hypothetical futures.** Three similar lines beat a premature helper.
- **Don't leave half-implemented features.** If a change cannot land cleanly, open an issue and *revert*, don't commit a fragment.
- **Hidden constraints deserve a comment.** If a line exists to work around a subtle bug or upstream quirk, say so in a short comment. Otherwise skip comments — well-named identifiers do the job.
- **If another agent's WIP is in the worktree, stop and ask.** See [`AGENTS.md`](../AGENTS.md) §"Concurrent-agent safety".
- **Al cerrar una funcionalidad, indica el puerto de prueba.** El usuario testea por túnel SSH `localhost:3000`. Si tu dev server corre en otro puerto (3001, 3002, etc. — habitual cuando hay worktrees paralelos), termina el mensaje con una línea explícita tipo: `🧪 Pruébalo en http://localhost:3001/<ruta>`. Si corre en 3000, no hace falta decirlo.

---

## 8. Checklist before opening a PR

- [ ] No cross-domain import into `internal/`, `_private/`, or `_*/`.
- [ ] No cross-domain import of a `*-store.ts`.
- [ ] No new `any` in `src/domains/` (except in the audit allowlist).
- [ ] If a Prisma schema changed: a migration file was generated and is backward compatible.
- [ ] If a public contract (exported function / Zod schema / Prisma field) changed: either non-breaking, or versioned with deprecation per §2.2.
- [ ] Ran `node scripts/audit-domain-contracts.mjs` — no new violations introduced.
- [ ] Ran `npm run typecheck` — clean.
- [ ] PR description lists any contract changes and whether they are breaking.

---

## 9. Roadmap / open items

Tracked so the next agent doesn't re-discover them:

- **ESLint + `no-restricted-imports`** — not installed. Adopting it means adding `eslint`, `@typescript-eslint/*`, a config, and a `lint` script to `package.json`. The audit script is the interim measure.
- **Domain barrels** — none today. If/when barrels are added, update §1.3 and migrate all cross-domain call sites in the same PR.
- **Contract tests** — [`test/contract/`](../test/contract/) does not exist yet. Recommended when a domain's surface stabilises.
- **`orders` ↔ `shipping` cycle** — both domains import each other at the file level: `orders/actions.ts` → `shipping/calculator`, `orders/checkout.ts` → `shipping/spain-provinces`, and `shipping/actions.ts` → `orders/order-line-snapshot`. `order-line-snapshot.ts` is an 8-line parser around a shared type in `src/types/order.ts` and is a good candidate to move to a neutral location (e.g. `src/types/` or `src/lib/orders-snapshot.ts`) to break the cycle. Tracked by [`scripts/audit-domain-contracts.mjs`](../scripts/audit-domain-contracts.mjs).
