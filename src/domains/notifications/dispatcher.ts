import { logger } from '@/lib/logger'
import {
  notificationEventPayloadSchemas,
  type NotificationEventMap,
  type NotificationEventName,
} from './events'

// Lazy server-only registration. Static imports of ensure-registered
// would pull telegram/web-push handler chains (and their server-only
// service code) into any client bundle that reaches this module via
// the notifications barrel. Dynamic imports keep the dispatcher
// client-safe while still bootstrapping handlers on the first emit
// in any node process — covering Next.js server runtime AND the
// node integration test runner that doesn't go through instrumentation.ts.
let handlersBootstrapped = false
async function ensureHandlersRegistered(): Promise<void> {
  if (handlersBootstrapped) return
  if (typeof window !== 'undefined') {
    // Never bootstrap server-only handlers in the browser.
    handlersBootstrapped = true
    return
  }
  handlersBootstrapped = true
  const [tg, wp, em] = await Promise.all([
    import('./telegram/ensure-registered'),
    import('./web-push/ensure-registered'),
    import('./email/ensure-registered'),
  ])
  tg.ensureTelegramHandlersRegistered()
  wp.ensureWebPushHandlersRegistered()
  em.ensureEmailHandlersRegistered()
}

type Handler<E extends NotificationEventName> = (
  payload: NotificationEventMap[E],
) => Promise<void> | void

type Registry = {
  [E in NotificationEventName]: Set<Handler<E>>
}

// HMR in dev re-evaluates this module on every change; without the globalThis
// guard each reload would register every handler again and duplicate every
// outbound notification. The audit logs would be the first place this shows.
const GLOBAL_KEY = '__marketplaceTelegramDispatcher'

type GlobalWithDispatcher = typeof globalThis & {
  [GLOBAL_KEY]?: { registry: Registry; pending: Set<Promise<void>> }
}

function getState(): { registry: Registry; pending: Set<Promise<void>> } {
  const g = globalThis as GlobalWithDispatcher
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      pending: new Set(),
      registry: {
        'order.created': new Set(),
        'order.pending': new Set(),
        'message.received': new Set(),
        'order.delivered': new Set(),
        'label.failed': new Set(),
        'incident.opened': new Set(),
        'review.received': new Set(),
        'payout.paid': new Set(),
        'stock.low': new Set(),
        'order.status_changed': new Set(),
        'order.buyer_confirmed': new Set(),
        'favorite.back_in_stock': new Set(),
        'favorite.price_drop': new Set(),
        'vendor.application.approved': new Set(),
        'vendor.application.rejected': new Set(),
      },
    }
  }
  return g[GLOBAL_KEY]
}

export function on<E extends NotificationEventName>(
  event: E,
  handler: Handler<E>,
): () => void {
  const { registry } = getState()
  registry[event].add(handler)
  return () => registry[event].delete(handler)
}

export function emit<E extends NotificationEventName>(
  event: E,
  payload: NotificationEventMap[E],
): void {
  const schema = notificationEventPayloadSchemas[event]
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    logger.error('notifications.emit.invalid_payload', {
      event,
      issues: parsed.error.issues,
    })
    return
  }

  // Register handlers lazily (dynamic import = no server-only chain
  // in client bundles), then read the registry and fire. queueMicrotask
  // already defers handler execution, so awaiting registration first
  // adds no observable latency.
  //
  // Each emit (registration + every queued handler invocation) is
  // tracked in a `pending` Set so the integration test harness can
  // await in-flight handlers before truncating the database. Without
  // this, a fire-and-forget handler (e.g. NotificationDelivery insert
  // in src/domains/notifications/telegram/service.ts) can race the
  // next test's `resetIntegrationDatabase()` and try to insert a row
  // referencing a User that the truncate just deleted, triggering
  // `NotificationDelivery_userId_fkey` violations on shards 4/6 (#975).
  const { pending } = getState()
  const job = ensureHandlersRegistered().then(() => {
    const { registry } = getState()
    const handlers = Array.from(registry[event])
    for (const handler of handlers) {
      const handlerPromise = new Promise<void>(resolve => {
        queueMicrotask(() => {
          Promise.resolve()
            .then(() => handler(parsed.data as NotificationEventMap[E]))
            .catch(err => {
              logger.error('notifications.handler.failed', {
                event,
                error: err instanceof Error ? err.message : String(err),
              })
            })
            .finally(() => resolve())
        })
      })
      pending.add(handlerPromise)
      void handlerPromise.finally(() => pending.delete(handlerPromise))
    }
  })
  pending.add(job)
  void job.finally(() => pending.delete(job))
}

/**
 * Awaits every in-flight notification dispatch (registration +
 * queued handler invocations). Used by the integration test harness
 * to drain fire-and-forget handlers before truncating, otherwise a
 * late `NotificationDelivery` insert can violate FK against a User
 * the truncate already removed.
 */
export async function waitForPendingNotifications(): Promise<void> {
  const { pending } = getState()
  // Drain in waves: a handler may emit a follow-up notification, which
  // adds new entries to `pending` after the initial Promise.all
  // settles. Loop until the set stabilises empty.
  while (pending.size > 0) {
    await Promise.all(Array.from(pending))
  }
}

export function clearHandlersForTest(): void {
  const { registry } = getState()
  for (const set of Object.values(registry)) set.clear()
}
