import {
  notificationEventPayloadSchemas,
  type NotificationEventMap,
  type NotificationEventName,
} from './events'

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
