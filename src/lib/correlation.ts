import { randomUUID } from 'node:crypto'

/**
 * Generates a short, sortable, URL-safe correlation ID for tracing a
 * single checkout attempt or webhook event across logs. Format:
 *
 *   <base36 ms timestamp>-<6 random base36 chars>
 *
 * Example: `lz9zh1b0-a7k2p3`
 *
 * Not cryptographically secure and not globally unique across many
 * machines at scale — it's a log correlation aid, not an ID you hand
 * out to clients. Prefer this over a raw UUID because it sorts
 * chronologically in `grep` output and is less visually noisy.
 *
 * When we eventually ship checkoutAttemptId (sub-issue #309), prefer
 * that over `generateCorrelationId()` for checkout logs — this helper
 * stays for ad-hoc correlation in paths that don't have a stable
 * identifier yet.
 */
export function generateCorrelationId(): string {
  const ts = Date.now().toString(36)
  const rand = randomUUID().replace(/-/g, '').slice(0, 6)
  return `${ts}-${rand}`
}
