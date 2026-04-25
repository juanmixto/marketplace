// Generic idempotency-token wrapper for admin/vendor server actions.
// Generalizes the `Order.checkoutAttemptId` pattern (see
// docs/checkout-dedupe.md) — the difference is scope (any mutation,
// not just checkout) and storage (a generic IdempotencyKey table
// instead of a UNIQUE column on the resource).
//
// Usage from a server component (issue the token at render time):
//
//   import { createIdempotencyToken } from '@/lib/idempotency'
//   export default async function NewProductPage() {
//     const idempotencyToken = createIdempotencyToken()
//     return <ProductForm idempotencyToken={idempotencyToken} />
//   }
//
// Usage from the server action (claim the token; replay throws):
//
//   export async function createProduct(input: unknown) {
//     const { idempotencyToken, ...data } = parsed
//     const session = await getActionSession()
//     return withIdempotency('product.create', idempotencyToken, session.user.id, async () => {
//       // ... actual creation logic
//     })
//   }
//
// IDEMPOTENCY GUARANTEE: a successful call records the token. A second
// call with the same (scope, token) by the same user throws
// AlreadyProcessedError; the caller maps that to a "tu cambio ya se
// guardó" toast (mirroring docs/checkout-dedupe.md replay UX).

import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'

const TTL_MS = 24 * 60 * 60 * 1000

export class AlreadyProcessedError extends Error {
  readonly scope: string
  readonly token: string
  constructor(scope: string, token: string) {
    super(`Idempotent replay detected: ${scope}/${token}`)
    this.name = 'AlreadyProcessedError'
    this.scope = scope
    this.token = token
  }
}

/** Generate a fresh server-side idempotency token (UUID v4). */
export function createIdempotencyToken(): string {
  return randomUUID()
}

/** Minimal contract a Prisma-like client must satisfy. Lets tests inject an
 *  in-memory implementation without touching Postgres. */
export interface IdempotencyDbClient {
  idempotencyKey: {
    create: (args: {
      data: { scope: string; token: string; userId: string; expiresAt: Date }
    }) => Promise<unknown>
    deleteMany: (args: { where: { expiresAt: { lt: Date } } }) => Promise<{ count: number }>
  }
}

/**
 * Run `fn` exactly once for a given (scope, token, userId) tuple.
 *
 * Behavior:
 *   - First call → claims the row in IdempotencyKey, runs `fn`, returns result.
 *   - Replay call (same scope+token) → INSERT fails the UNIQUE; we throw
 *     AlreadyProcessedError. We treat cross-tenant replay (different user)
 *     identically — never leak existence to other tenants.
 *
 * The claim is *issued before* `fn` runs. This means a token whose `fn`
 * crashes is also burned — by design, since the user has no way to know
 * whether the partial work was committed. The 24h TTL bounds the worst case.
 */
export async function withIdempotency<T>(
  scope: string,
  token: string,
  userId: string,
  fn: () => Promise<T>,
  client: IdempotencyDbClient = db,
): Promise<T> {
  const expiresAt = new Date(Date.now() + TTL_MS)
  try {
    await client.idempotencyKey.create({
      data: { scope, token, userId, expiresAt },
    })
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: unknown }).code === 'P2002'
    ) {
      throw new AlreadyProcessedError(scope, token)
    }
    throw err
  }
  return await fn()
}

/**
 * Sweep expired idempotency keys. Idempotent itself — safe to run from a
 * cron job. Returns the count of rows deleted.
 */
export async function cleanupExpiredIdempotencyKeys(
  client: IdempotencyDbClient = db,
): Promise<number> {
  const result = await client.idempotencyKey.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
  return result.count
}
