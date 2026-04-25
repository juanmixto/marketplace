---
title: Idempotency tokens for admin/vendor mutations
last_verified_against_main: 2026-04-25
---

# Idempotency tokens for admin/vendor mutations (#788)

> Generalizes the `Order.checkoutAttemptId` pattern (see [`docs/checkout-dedupe.md`](./checkout-dedupe.md)) so any admin/vendor server action that creates or modifies a resource can survive a double-submit on a flaky mobile network without producing duplicates.

## Why this exists

Checkout has been protected against double-submit since #410 via the `Order.checkoutAttemptId` UNIQUE column. But every other mutation form (create product, update promotion, change order state, manage payouts) had no equivalent guard. On 3G, a buyer who taps "Save" twice while waiting for the network sees two products created, two emails sent, two audit-log entries.

The 2026-04-25 mobile audit (#779) flagged this as a P2 issue. This doc describes the foundation shipped in #788 PR-A and the rollout plan for PR-B.

## Architecture

### Storage — Prisma table, not Redis

The repo has no Redis dependency. Adding it solely for idempotency would introduce a new infrastructure point of failure for a relatively low-volume signal (admin/vendor mutations, not checkout). The Postgres approach scales trivially:

```prisma
model IdempotencyKey {
  id        String   @id @default(cuid())
  scope     String
  token     String
  userId    String
  createdAt DateTime @default(now())
  expiresAt DateTime

  @@unique([scope, token])
  @@index([userId])
  @@index([expiresAt])
}
```

The `(scope, token)` UNIQUE is the dedupe pivot. Scope isolates different mutation types so a `product.create` token can't collide with a `promotion.update` token. `userId` is enforced at the wrapper level for cross-tenant safety (see [`docs/authz-audit.md`](./authz-audit.md)).

### TTL — 24 hours

Tokens expire 24h after issue. Long enough to survive a user who abandons the form and returns the next morning; short enough that the table stays small. A cron-style cleanup calls `cleanupExpiredIdempotencyKeys()` periodically.

### Why not a UNIQUE column on the resource (the checkout pattern)?

`Order.checkoutAttemptId` works for checkout because every order *must* go through one specific server action. For generic admin/vendor mutations there are too many resources (products, promotions, payouts, fulfillments, …) and the column would have to live on every one of them. A central `IdempotencyKey` table is the boundary; the resource tables stay clean.

## Usage

### 1. Issue a token in the server component

```tsx
// src/app/(vendor)/vendor/productos/nuevo/page.tsx
import { createIdempotencyToken } from '@/lib/idempotency'

export const dynamic = 'force-dynamic' // mandatory — see "force-dynamic" below

export default async function NuevoProductoPage() {
  const idempotencyToken = createIdempotencyToken()
  return <ProductForm idempotencyToken={idempotencyToken} />
}
```

### 2. Capture in a ref in the client form

```tsx
// src/components/vendor/ProductForm.tsx
'use client'
import { useRef } from 'react'

export function ProductForm({ idempotencyToken }: { idempotencyToken: string }) {
  const idempotencyTokenRef = useRef(idempotencyToken)
  // ...
  const onSubmit = async () => {
    await createProduct(payload, idempotencyTokenRef.current)
  }
}
```

The `useRef` is mandatory: a re-render mid-submit would otherwise regenerate the token and bypass the protection. Same pattern as `CheckoutPageClient` from #524.

### 3. Wrap the server action

```ts
// src/domains/vendors/actions.ts
import { withIdempotency } from '@/lib/idempotency'

export async function createProduct(input: ProductInput, idempotencyToken?: string) {
  const { vendor, session } = await requireVendor()
  const data = productSchema.parse(input)

  const doCreate = async () => { /* actual creation */ }

  if (idempotencyToken) {
    return withIdempotency('product.create', idempotencyToken, session.user.id, doCreate)
  }
  return doCreate() // legacy callers without a token still work
}
```

The token is **optional in the action signature** so existing callers (tests, internal scripts) keep working. UI callers always pass it.

### 4. UX: surfacing replay

A replay throws `AlreadyProcessedError`. Map that to a user-visible "tu cambio ya se guardó" toast — same UX as checkout replay (see [`docs/checkout-dedupe.md`](./checkout-dedupe.md) §UX matrix).

## `force-dynamic` is mandatory

Pages that issue tokens **must** export `dynamic = 'force-dynamic'`. Otherwise the route can be cached and serve a stale token to multiple users — turning a security feature into a security incident.

The checkout page does this; we copied the convention. PR review must enforce it on every new page that calls `createIdempotencyToken()`.

## Failure modes

### `fn` throws after the claim is made

The token is **burned anyway**. By design: the user has no way to know whether the partial work was committed (an INSERT could have succeeded before a downstream call failed). A retry would risk duplication. The 24h TTL bounds the worst case; the user can refresh the page (gets a fresh token) and try again.

### Two simultaneous requests with the same token

Postgres serializes the two INSERTs via the UNIQUE. The loser gets P2002 → `AlreadyProcessedError`. The winner runs `fn` to completion. No race window.

### Cross-tenant replay (different `userId`, same `(scope, token)`)

Treated identically to a same-user replay: throws `AlreadyProcessedError`. We do **not** signal "this token belongs to someone else" — that would leak existence. The malicious user sees the same error as a legitimate replay.

## Rollout

- **PR-A (#788, foundation)** — Prisma migration, `withIdempotency` helper, tests, applied to `createProduct` as the proof of concept.
- **PR-B (#788, adoption)** — apply to: promotion create/update, fulfillment status updates, payout mutations, any other high-risk admin form.

After PR-B, opening a new server action without idempotency on a mutation form should be flagged in code review using this doc as the reference.

## Cleanup job

`cleanupExpiredIdempotencyKeys()` deletes rows where `expiresAt < now()`. Wire it into a daily cron (Vercel cron or a Next.js route handler) — one call per day suffices given the low write volume.

## Related

- [`docs/checkout-dedupe.md`](./checkout-dedupe.md) — the original pattern this generalizes.
- [`docs/authz-audit.md`](./authz-audit.md) — every wrapped action still needs its own ownership / role check; idempotency does not replace authz.
