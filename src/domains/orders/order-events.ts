/**
 * OrderEvent type registry (#965).
 *
 * `OrderEvent` is the append-only business log keyed off `Order`. The
 * `type` column is intentionally a free-form string at the DB layer
 * (the table predates this registry and several call sites already
 * write strings that are not in this list — e.g. ingestion sync and
 * notification-deduper sentinels). This module is the **TS-side**
 * source of truth for the *known* event types and the schema version
 * of their payload.
 *
 * Rules:
 * - When emitting one of the known events below, prefer the constant
 *   from `OrderEventType` over a literal string. The constant lets
 *   future grep-and-rename actually find every emitter.
 * - When the *shape* of `OrderEvent.payload` for a given type
 *   changes, bump `ORDER_EVENT_SCHEMA_VERSIONS[type]` AND pass the
 *   new value as `schemaVersion` on the create call. Old rows keep
 *   their stored version, so historical reports can branch on the
 *   stored value when parsing.
 * - Adding a new event type: add it here AND add an entry to
 *   `ORDER_EVENT_SCHEMA_VERSIONS` (defaults to 1). No DB migration
 *   needed — `type` is a free-form string at the schema level.
 */

export const OrderEventType = {
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_MISMATCH: 'PAYMENT_MISMATCH',
  PAYMENT_INTENT_CREATION_FAILED: 'PAYMENT_INTENT_CREATION_FAILED',
  PAYMENT_WEBHOOK_RETRY_EXHAUSTED: 'PAYMENT_WEBHOOK_RETRY_EXHAUSTED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  SUBSCRIPTION_RENEWAL_CHARGED: 'SUBSCRIPTION_RENEWAL_CHARGED',
} as const

export type OrderEventType = (typeof OrderEventType)[keyof typeof OrderEventType]

/**
 * Current schema version of each known event's payload. Keyed by
 * `OrderEventType`. Bump on payload-shape change; the writer is
 * responsible for passing this value as `schemaVersion` on the
 * create call so historical rows preserve the version they were
 * written with.
 */
export const ORDER_EVENT_SCHEMA_VERSIONS: Record<OrderEventType, number> = {
  PAYMENT_CONFIRMED: 1,
  PAYMENT_FAILED: 1,
  PAYMENT_MISMATCH: 1,
  PAYMENT_INTENT_CREATION_FAILED: 1,
  PAYMENT_WEBHOOK_RETRY_EXHAUSTED: 1,
  ORDER_CANCELLED: 1,
  SUBSCRIPTION_RENEWAL_CHARGED: 1,
}

/**
 * Type guard: is this string one of the known event types? Useful
 * when reading historical rows where the `type` field is a free-form
 * string at the DB layer.
 */
export function isKnownOrderEventType(type: string): type is OrderEventType {
  return type in ORDER_EVENT_SCHEMA_VERSIONS
}
