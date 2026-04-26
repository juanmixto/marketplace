import { registerWebPushHandlers } from './handlers/register'

/**
 * Idempotent entry point — modules that emit notification events
 * (orders, shipping, reviews, settlements, incidents, vendors) call
 * this at import time so every server runtime has the web-push
 * handlers subscribed before the first emit. Matches the pattern
 * Telegram uses via `ensureTelegramHandlersRegistered`.
 *
 * Idempotency is enforced inside `registerWebPushHandlers` via a global
 * flag that only latches once config is actually present, so an early
 * call with no VAPID keys doesn't permanently disable later registration.
 */
export function ensureWebPushHandlersRegistered(): void {
  registerWebPushHandlers()
}
