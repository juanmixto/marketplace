/**
 * Notification outbox primitives (#1171 H-10).
 *
 * Background: the original notification flow committed an Order in a
 * transaction and then called `emitNotification(...)` post-commit. A
 * crash in the gap between commit and emit would silently lose the
 * buyer-confirmation email — for the buyer the dollars cleared but
 * the inbox stayed empty, prompting "no me llegó nada" support tickets.
 *
 * The outbox closes that gap by recording an intent row inside the
 * same transaction as the state change. The fast path then does its
 * best-effort emit and marks the row delivered. A separate sweeper
 * picks up any intent that never got its DELIVERED counterpart and
 * retries the emit. Idempotency is achieved at two levels:
 *
 *   1. The intent row is keyed by `(orderId, payloadRef)` — so two
 *      intents for the same logical event collapse to one.
 *   2. The DELIVERED row is also keyed by `payloadRef` and matched
 *      against the corresponding PENDING — re-running the sweeper
 *      cannot cause a duplicate delivery row.
 *
 * Storage: this leverages the existing `OrderEvent` audit log instead
 * of introducing a new table — `OrderEvent.type` is a free-form String
 * column, so adding two new types (`NOTIFICATION_PENDING` and
 * `NOTIFICATION_DELIVERED`) is schema-free.
 *
 * Scope (initial slice): only `order.buyer_confirmed` is wired through
 * the outbox today. Vendor-side `order.created` and `stock.low` events
 * still use the best-effort post-commit dispatch — they are vendor-
 * facing and noisy enough that a rare miss is absorbable. If those
 * surface as a real problem we extend the same primitives.
 */

import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import type { NotificationEventMap } from '@/domains/notifications/events'
import { emit as emitNotification } from '@/domains/notifications/dispatcher'
import { logger } from '@/lib/logger'

export const NOTIFICATION_OUTBOX_PENDING = 'NOTIFICATION_PENDING'
export const NOTIFICATION_OUTBOX_DELIVERED = 'NOTIFICATION_DELIVERED'

export type SupportedOutboxEvent = 'order.buyer_confirmed'

interface RecordPendingArgs<E extends SupportedOutboxEvent> {
  orderId: string
  event: E
  payload: NotificationEventMap[E]
}

/**
 * Insert a `NOTIFICATION_PENDING` row inside a caller-supplied
 * transaction. The caller is responsible for keeping this in the same
 * `db.$transaction` scope as the business state mutation that triggers
 * the notification — that's the whole point of the outbox.
 *
 * `payloadRef` is a stable string that uniquely identifies this intent
 * within the order. For most events `event:orderId` is sufficient
 * (one buyer-confirmed per order). Including it in the payload makes
 * it trivial for the sweeper to match against the DELIVERED row.
 */
export async function recordPendingNotification<E extends SupportedOutboxEvent>(
  tx: Prisma.TransactionClient,
  args: RecordPendingArgs<E>,
): Promise<void> {
  const payloadRef = `${args.event}:${args.orderId}`
  await tx.orderEvent.create({
    data: {
      orderId: args.orderId,
      type: NOTIFICATION_OUTBOX_PENDING,
      payload: {
        event: args.event,
        payload: args.payload as Prisma.InputJsonValue,
        payloadRef,
        recordedAt: new Date().toISOString(),
      },
    },
  })
}

/**
 * Mark a previously-recorded `NOTIFICATION_PENDING` as delivered by
 * appending a corresponding `NOTIFICATION_DELIVERED` row. We never
 * mutate the original PENDING row — OrderEvent is append-only by
 * convention. The sweeper joins PENDING and DELIVERED by
 * `payload->>payloadRef` to decide what's still outstanding.
 *
 * Best-effort by design: if this insert fails (DB blip, etc.) the
 * sweeper will see the PENDING without DELIVERED and try the emit
 * again. Duplicate emits are the failure mode we accept here, in
 * exchange for never losing one — and the consumer side
 * (NotificationPreferences + downstream handlers) is already idempotent.
 */
export async function markNotificationDelivered<E extends SupportedOutboxEvent>(
  db: PrismaClient,
  args: { orderId: string; event: E },
): Promise<void> {
  const payloadRef = `${args.event}:${args.orderId}`
  await db.orderEvent.create({
    data: {
      orderId: args.orderId,
      type: NOTIFICATION_OUTBOX_DELIVERED,
      payload: {
        event: args.event,
        payloadRef,
        deliveredAt: new Date().toISOString(),
      },
    },
  })
}

interface OutboxSweepReport {
  reviewed: number
  delivered: number
  errors: number
  skipped: number
}

interface PendingRow {
  id: string
  orderId: string
  payload: unknown
  createdAt: Date
}

function extractPayloadRef(row: PendingRow): string | null {
  const p = row.payload
  if (!p || typeof p !== 'object') return null
  const ref = (p as { payloadRef?: unknown }).payloadRef
  return typeof ref === 'string' && ref.length > 0 ? ref : null
}

function extractEventName(row: PendingRow): SupportedOutboxEvent | null {
  const p = row.payload
  if (!p || typeof p !== 'object') return null
  const e = (p as { event?: unknown }).event
  if (e === 'order.buyer_confirmed') return e
  return null
}

function extractEventPayload(row: PendingRow): NotificationEventMap[SupportedOutboxEvent] | null {
  const p = row.payload
  if (!p || typeof p !== 'object') return null
  const inner = (p as { payload?: unknown }).payload
  if (!inner || typeof inner !== 'object') return null
  const candidate = inner as { orderId?: unknown; customerUserId?: unknown }
  if (typeof candidate.orderId !== 'string' || typeof candidate.customerUserId !== 'string') {
    return null
  }
  return { orderId: candidate.orderId, customerUserId: candidate.customerUserId }
}

/**
 * Operator-triggered sweep that re-emits any `NOTIFICATION_PENDING`
 * row whose `payloadRef` lacks a matching `NOTIFICATION_DELIVERED`
 * sibling. Mirrors the persistence pattern used by
 * `reconcile-payments` (#405): not a cron, idempotent, safe to re-run.
 *
 * The cutoff (default 10 minutes) prevents racing with the
 * post-commit fast path — a notification recorded 5 minutes ago is
 * very likely still in flight.
 */
export async function dispatchPendingOutboxNotifications({
  db,
  olderThanMinutes = 10,
  now = new Date(),
  limit = 200,
  emit = emitNotification,
}: {
  db: PrismaClient
  olderThanMinutes?: number
  now?: Date
  limit?: number
  emit?: typeof emitNotification
}): Promise<OutboxSweepReport> {
  const cutoff = new Date(now.getTime() - olderThanMinutes * 60 * 1000)

  const pending = await db.orderEvent.findMany({
    where: {
      type: NOTIFICATION_OUTBOX_PENDING,
      createdAt: { lt: cutoff },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true, orderId: true, payload: true, createdAt: true },
  })

  if (pending.length === 0) {
    return { reviewed: 0, delivered: 0, errors: 0, skipped: 0 }
  }

  // Resolve which payloadRefs already have a DELIVERED sibling.
  const refs = pending
    .map(extractPayloadRef)
    .filter((r): r is string => r !== null)
  const deliveredRows = refs.length === 0
    ? []
    : await db.orderEvent.findMany({
      where: { type: NOTIFICATION_OUTBOX_DELIVERED },
      select: { payload: true },
    })
  const deliveredRefs = new Set(
    deliveredRows
      .map(r => {
        const p = r.payload
        if (!p || typeof p !== 'object') return null
        const ref = (p as { payloadRef?: unknown }).payloadRef
        return typeof ref === 'string' ? ref : null
      })
      .filter((r): r is string => r !== null && refs.includes(r)),
  )

  const report: OutboxSweepReport = { reviewed: pending.length, delivered: 0, errors: 0, skipped: 0 }

  for (const row of pending) {
    const ref = extractPayloadRef(row)
    if (!ref) {
      report.skipped += 1
      logger.warn('notifications.outbox.malformed_payload', { eventRowId: row.id })
      continue
    }
    if (deliveredRefs.has(ref)) {
      report.skipped += 1
      continue
    }
    const eventName = extractEventName(row)
    const eventPayload = extractEventPayload(row)
    if (!eventName || !eventPayload) {
      report.skipped += 1
      logger.warn('notifications.outbox.unsupported_event', {
        eventRowId: row.id,
        payloadShape: typeof row.payload,
      })
      continue
    }
    try {
      emit(eventName, eventPayload)
      await markNotificationDelivered(db, { orderId: row.orderId, event: eventName })
      report.delivered += 1
      logger.info('notifications.outbox.delivered', {
        eventRowId: row.id,
        orderId: row.orderId,
        event: eventName,
        ageMinutes: Math.round((now.getTime() - row.createdAt.getTime()) / 60_000),
      })
    } catch (err) {
      report.errors += 1
      logger.error('notifications.outbox.dispatch_error', {
        eventRowId: row.id,
        orderId: row.orderId,
        event: eventName,
        error: err,
      })
    }
  }

  return report
}
