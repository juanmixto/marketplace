/**
 * `createdBy` / `updatedBy` helpers (#1359, epic #1346 — PII pre-launch).
 *
 * Second source of actor traceability for the four high-value models
 * (`User`, `Order`, `Vendor`, `Product`). Independent of `AuditLog` so
 * a writer bug in `mutateWithAudit` or a future retention purge of
 * the audit table doesn't erase the "who created this row" answer.
 *
 * Stored as plain `String?` (no FK to User) so:
 *   - Sentinel actors (`'system'`, `'stripe-webhook'`, `'cron-X'`) fit
 *     without fake User rows.
 *   - GDPR anonimization of the actor doesn't need to cascade or
 *     re-write every row they ever touched.
 *
 * Usage:
 *
 *   await db.vendor.update({
 *     where: { id },
 *     data: { status: 'ACTIVE', ...trackUpdate(actor) },
 *   })
 *
 *   await db.product.create({
 *     data: { ...productData, ...trackCreate(actor) },
 *   })
 *
 * The `actor` parameter accepts a plain id, a sentinel, or `null`
 * (events with no admin actor like Stripe webhooks). Don't build
 * objects with `{ ...trackUpdate(undefined) }` — pass the explicit
 * `null` so the call site documents intent.
 */

const SYSTEM_ACTOR = 'system' as const

export type Actor =
  | string
  | null
  /**
   * Sentinel for non-human writers. Stored as the literal `'system'`
   * for greppability across logs.
   */
  | typeof SYSTEM_ACTOR

function normalize(actor: Actor): string | null {
  if (actor === null) return null
  if (typeof actor === 'string') return actor.trim() || null
  return null
}

/**
 * Returns the `createdById` + `updatedById` pair for a row being
 * created. Both fields point at the same actor — that's the contract:
 * every create implicitly is also an "update from null".
 */
export function trackCreate(actor: Actor): {
  createdById: string | null
  updatedById: string | null
} {
  const id = normalize(actor)
  return { createdById: id, updatedById: id }
}

/**
 * Returns just the `updatedById` for a row being updated. Doesn't
 * touch `createdById` — that field is set once at create-time and
 * stays stable for the row's lifetime.
 */
export function trackUpdate(actor: Actor): { updatedById: string | null } {
  return { updatedById: normalize(actor) }
}

export const SYSTEM = SYSTEM_ACTOR
