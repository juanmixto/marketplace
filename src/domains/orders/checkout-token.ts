import { randomUUID } from 'node:crypto'

/**
 * Server-issued idempotency key for a single checkout attempt (#410).
 *
 * The checkout page renders with a fresh token embedded in the form.
 * The client submits it alongside the cart payload. `createOrder` uses
 * it to dedupe double-clicks, tab-reloads, and mobile network retries:
 *
 *   - First call with token X commits normally. The resulting Order
 *     stores X in `checkoutAttemptId`.
 *   - Concurrent call with the same X races to the DB and loses on the
 *     UNIQUE(checkoutAttemptId) constraint. The handler catches the
 *     violation, reads the existing Order, and returns it with
 *     `replayed: true`.
 *   - Retry after a success (e.g. network dropped before the response)
 *     with the same X: the pre-check finds the row and returns it with
 *     `replayed: true` — no second Order is created.
 *
 * Format matches the `correlationId` helper (#414): a base36 millisecond
 * timestamp + 22-hex-char random tail. Sortable, URL-safe, ~128 bits of
 * entropy so collisions are effectively impossible across tenants.
 */
export function generateCheckoutAttemptId(): string {
  const ts = Date.now().toString(36)
  const rand = randomUUID().replace(/-/g, '')
  return `cat_${ts}_${rand}`
}

const TOKEN_SHAPE = /^cat_[0-9a-z]+_[0-9a-f]{32}$/

/**
 * Narrow validator used at the server-action boundary. Accepts the shape
 * emitted by `generateCheckoutAttemptId` and nothing else. A malformed
 * token from a tampered client is rejected up front.
 */
export function isValidCheckoutAttemptId(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_SHAPE.test(token)
}
