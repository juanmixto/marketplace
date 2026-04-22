import {
  notificationEventPayloadSchemas,
  type NotificationEventMap,
  type NotificationEventName,
} from './events'
import { ensureTelegramHandlersRegistered } from './telegram/ensure-registered'
import { ensureWebPushHandlersRegistered } from './web-push/ensure-registered'

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
  [GLOBAL_KEY]?: { registry: Registry }
}

function getState(): { registry: Registry } {
  const g = globalThis as GlobalWithDispatcher
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
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
    console.error('notifications.emit.invalid_payload', {
      event,
      issues: parsed.error.issues,
    })
    return
  }

  ensureTelegramHandlersRegistered()
  ensureWebPushHandlersRegistered()

  const { registry } = getState()
  const handlers = Array.from(registry[event])

  for (const handler of handlers) {
    queueMicrotask(() => {
      Promise.resolve()
        .then(() => handler(parsed.data as NotificationEventMap[E]))
        .catch(err => {
          console.error('notifications.handler.failed', {
            event,
            error: err instanceof Error ? err.message : String(err),
          })
        })
    })
  }
}

export function clearHandlersForTest(): void {
  const { registry } = getState()
  for (const set of Object.values(registry)) set.clear()
}
