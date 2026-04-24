import { registerWebPushHandlers } from './handlers/register'

let registered = false

/**
 * Idempotent entry point — modules that emit notification events
 * (orders, shipping, reviews, settlements, incidents, vendors) call
 * this at import time so every server runtime has the web-push
 * handlers subscribed before the first emit. Matches the pattern
 * Telegram uses via `ensureTelegramHandlersRegistered`.
 */
export function ensureWebPushHandlersRegistered(): void {
  if (registered) return
  registered = true
  registerWebPushHandlers()
}
