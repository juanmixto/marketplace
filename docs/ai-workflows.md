---
title: AI Workflows — recipes for agents
last_verified_against_main: 2026-04-16
---

# AI Workflows — recipes for agents

> Practical recipes built on top of [`docs/ai-guidelines.md`](./ai-guidelines.md) (rules) and [`docs/conventions.md`](./conventions.md) (stack). Read those first.

---

## TL;DR for a new agent

1. `git status` in any worktree you touch. If there are uncommitted changes that are not yours, **stop and ask** ([`AGENTS.md`](../AGENTS.md) §concurrent-agent safety).
2. Read the three docs: [`AGENTS.md`](../AGENTS.md) → [`docs/conventions.md`](./conventions.md) → [`docs/ai-guidelines.md`](./ai-guidelines.md).
3. Plan the smallest change that solves the task.
4. Before opening a PR run:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run audit:contracts`
   - the relevant slice of the test suite
5. PR description lists any contract changes and whether they are breaking.

---

## Recipe 1 — Add a new feature inside an existing domain

**Goal:** implement `markOrderDelivered(orderId)` inside `orders`.

1. Grep the domain first:
   ```bash
   rg -n "markOrder|delivered" src/domains/orders/
   ```
   Don't duplicate an existing function.
2. Add the action to [`src/domains/orders/actions.ts`](../src/domains/orders/actions.ts) (or a new file under the same domain). Follow the Server Action pattern in [`docs/conventions.md`](./conventions.md) §Server Action pattern:
   ```ts
   'use server'
   import { z } from 'zod'
   import { db } from '@/lib/db'
   import { getActionSession } from '@/lib/action-session'
   import { isVendor } from '@/lib/roles'
   import { safeRevalidatePath } from '@/lib/revalidate'

   const markDeliveredSchema = z.object({ orderId: z.string().cuid() })

   export async function markOrderDelivered(input: unknown) {
     const { orderId } = markDeliveredSchema.parse(input)
     const session = await getActionSession()
     if (!session || !isVendor(session.user.role)) return { ok: false as const, error: 'forbidden' }
     // ... update + revalidate
     safeRevalidatePath('/vendor/pedidos')
     return { ok: true as const }
   }
   ```
3. Consume it from the page (`app/(vendor)/.../page.tsx`) — same file-level import surface the rest of the repo uses.
4. Run the checks in the TL;DR.

**Do NOT:**
- Reach into another domain's private helpers.
- Add a `utils.ts` full of speculative helpers — add only what this feature needs.
- Forget the Zod parse at the server-action boundary.

---

## Recipe 2 — Add a new domain

**Goal:** add `notifications` as a new domain.

1. Create [`src/domains/notifications/`](../src/domains/notifications/).
2. Add files for the feature (`actions.ts`, `types.ts`, `queries.ts` as needed).
3. **Create a barrel** `src/domains/notifications/index.ts` matching the style of the other 18 domains:
   ```ts
   export * from './actions'
   export * from './types'
   // NOT exported: *-store.ts, anything under internal/ or _*/
   ```
4. Call sites outside the domain should import from `@/domains/notifications`. (Existing domains still have a mix of barrel and deep imports — don't churn them; see [`docs/ai-guidelines.md`](./ai-guidelines.md) §1.3.)
5. Add the domain to the directory layout block in [`docs/conventions.md`](./conventions.md).

---

## Recipe 3 — Refactor safely

> Goal: rename an exported function without breaking callers.

**Don't** find-and-replace across the repo in one PR. Instead:

1. **Add** the new name in the same file, delegating to the old one:
   ```ts
   /** @deprecated use fulfillOrder */
   export const completeOrder = fulfillOrder

   export async function fulfillOrder(orderId: string) { /* ... */ }
   ```
2. Open PR #1 — adds the new name, leaves the old one as a deprecated alias. Nothing breaks.
3. Migrate callers in PR #2. Small commits, one area at a time.
4. Remove the alias in PR #3 once `rg "completeOrder" src/` returns nothing.

**Why split into three PRs?** If PR #2 conflicts with concurrent work, you can land the first and last independently. The repo is never in a broken intermediate state.

---

## Recipe 4 — Modify a Prisma schema

1. Edit [`prisma/schema.prisma`](../prisma/schema.prisma).
2. Generate a migration: `npm run db:migrate -- --name add_foo_to_bar`.
3. Inspect the SQL. If it locks a large table or changes a column type in place, split:
   - Migration A: `ADD COLUMN` nullable.
   - Migration B (separate PR, after deploy): backfill + `SET NOT NULL`.
4. Regenerate the client: `npm run prisma:generate`.
5. Update any Zod schemas that mirror the Prisma model.
6. Never merge a migration that cannot roll back gracefully while code from the previous deploy is still running.

See [`docs/ai-guidelines.md`](./ai-guidelines.md) §5 for the full backward-compat rules.

---

## Recipe 5 — Change a contract (exported function / schema shape)

Follow [`docs/ai-guidelines.md`](./ai-guidelines.md) §2. The short version:

| Change | Breaking? | How to ship |
|---|---|---|
| Add a new export | No | Ship directly. |
| Add an optional param at end | No | Ship directly. |
| Widen a return type | Usually no | Spot-check callers. |
| Add an optional Zod field | No | Ship directly. |
| Rename an export | **Yes** | Add alias → migrate callers → remove alias. |
| Remove/rename a required Zod field | **Yes** | New schema (`fooV2Schema`) → parse shim → migrate → retire. |
| Change a Prisma field name | **Yes** | Dual-write migration. See Recipe 4. |
| Narrow a function signature | **Yes** | Add overload or new function; deprecate old. |

In the PR description, include a line: `Contract changes: none` / `Contract changes: <list + breaking y/n>`. Reviewers grep for it.

---

## Recipe 6 — Touch Zustand state

1. Locate the existing store (grep for `create` + `zustand` or `-store.ts`).
2. Open the store file — it must start with `'use client'`.
3. Add your slice **inside** the existing store if the state is part of the same concern, or create a new `something-store.ts` in the domain that owns the data.
4. **Do not import the store from a Server Component, Server Action, route handler, or middleware.** The audit script flags that.
5. If a server-computed initial value is needed, receive it as a prop in a `'use client'` wrapper and hydrate the store from there.

---

## Recipe 7 — Touch a file that's already modified in the worktree

From [`AGENTS.md`](../AGENTS.md):

1. Run `git status`.
2. If the file is modified but **not yours**, stop. Ask the user or check the last commit author.
3. Never `git stash` or `git restore` someone else's work.
4. If the change is yours from an earlier session, proceed — but do a `git diff <file>` first to remember what's pending.

---

## Imports — quick reference

```ts
// ✅ Correct — preferred for new code (uses the domain barrel)
import { getOrderDetail } from '@/domains/orders'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { UserRole } from '@/generated/prisma/enums'
import { useCartStore } from '@/domains/orders/cart-store' // only from 'use client' files

// ✅ Tolerated — existing deep file imports still work. Don't churn them just
// to switch to the barrel; only touch when you're editing the import line anyway.
import { getOrderDetail } from '@/domains/orders/actions'

// ❌ Wrong — path does not exist
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { PrismaClient } from '@prisma/client'

// ❌ Wrong — reaches into private/internal subfolder of another domain (ESLint blocks)
import { foo } from '@/domains/orders/internal/price-calc'
import { bar } from '@/domains/orders/_helpers/format'

// ❌ Wrong — Zustand store pulled into the server graph (audit script flags)
// (file does not start with 'use client')
import { useCartStore } from '@/domains/orders/cart-store'
```

---

## Commands cheat-sheet

```bash
npm run typecheck                          # tsc --noEmit
npm run lint                               # eslint . --max-warnings=0
npm run audit:contracts                    # dynamic architecture checks
npm run audit:contracts -- --soft --json   # machine-readable, never fails
npm run test                               # node tests
npm run test:e2e:smoke                     # playwright smoke
./scripts/git-hygiene.sh                   # branch hygiene (periodically)
```

---

## What to do when…

- **…you're not sure which domain something belongs to.** Leave it where it is and ask. Arbitrary reshuffles create merge conflicts for other agents.
- **…the rule says X but the code clearly needs Y.** Write the guideline update in the same PR and justify it. The guidelines are source of truth — but they *follow* code when a good reason exists.
- **…the audit script is wrong.** Open a PR fixing [`scripts/audit-domain-contracts.mjs`](../scripts/audit-domain-contracts.mjs) with a regression case (e.g. a fixture under `test/contracts/audit/` asserting the script's JSON output). Don't silently widen the allowlist.
- **…you hit a merge conflict from another agent's work.** Prefer `git rebase origin/main` on a small branch over trying to untangle. Ask the user if stuck.
