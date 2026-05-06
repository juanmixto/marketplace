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

// ─── Actor-required write helper (#1356) ─────────────────────────────────────

/**
 * Event types whose emission MUST carry a non-empty `actorId`. These
 * are admin-initiated mutating events — without an actor, a forensic
 * "who issued this refund?" or "who cancelled this order?" has no
 * answer. System-driven events (Stripe webhooks, automatic
 * transitions) keep `actorId` nullable.
 *
 * Add a new entry here when introducing an admin-mutating event
 * (`STATUS_FORCED`, `MANUAL_REFUND`, etc.).
 */
export const ACTOR_REQUIRED_ORDER_EVENT_TYPES: ReadonlySet<string> = new Set([
  'ORDER_CANCELLED',
  'REFUND_ISSUED',
])

export class OrderEventActorRequiredError extends Error {
  readonly type: string
  constructor(type: string) {
    super(
      `OrderEvent type "${type}" requires a non-empty actorId — admin-mutating events must be traceable to a User.`,
    )
    this.name = 'OrderEventActorRequiredError'
    this.type = type
  }
}

/**
 * Minimal Prisma-client surface we need. Accepts both `db` and a
 * transaction client. Typed as `unknown` for the args + return so we
 * don't need to leak `Prisma.TransactionClient` through every domain
 * that emits events; the implementation casts back to the real
 * Prisma shape.
 */
export interface OrderEventWriter {
  orderEvent: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(args: any): Promise<unknown>
  }
}

export interface RecordOrderEventInput {
  client: OrderEventWriter
  orderId: string
  type: string
  /**
   * Required for entries in `ACTOR_REQUIRED_ORDER_EVENT_TYPES`. For
   * system events, pass `null` explicitly to make the intent visible
   * at the call site.
   */
  actorId: string | null
  schemaVersion?: number
  payload?: Record<string, unknown> | null
}

/**
 * Sanctioned write site for `OrderEvent`. Validates the actor
 * requirement against `ACTOR_REQUIRED_ORDER_EVENT_TYPES` and forwards
 * to Prisma. Use this from any path that emits an admin-mutating
 * event; system paths can keep `tx.orderEvent.create(...)` directly
 * but are encouraged to migrate for the type-system contract.
 */
export async function recordOrderEvent(input: RecordOrderEventInput): Promise<void> {
  const { client, orderId, type, actorId, schemaVersion, payload } = input
  if (
    ACTOR_REQUIRED_ORDER_EVENT_TYPES.has(type)
    && (actorId === null || actorId === undefined || actorId === '')
  ) {
    throw new OrderEventActorRequiredError(type)
  }
  await client.orderEvent.create({
    data: {
      orderId,
      actorId: actorId ?? null,
      type,
      schemaVersion:
        schemaVersion
        ?? (isKnownOrderEventType(type) ? ORDER_EVENT_SCHEMA_VERSIONS[type] : 1),
      payload: payload ?? undefined,
    },
  })
}
