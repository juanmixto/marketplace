import { registerTelegramHandlers } from './handlers/register'

export function ensureTelegramHandlersRegistered(): void {
  // Idempotency lives inside `registerTelegramHandlers` (global flag set
  // only when config is actually present and `on()` calls fire), so an
  // early no-config call doesn't latch and prevent a later successful
  // registration once env is set. This matters for integration tests:
  // module-import-time bootstrap in vendors/actions.ts runs before
  // `beforeEach` sets TELEGRAM_BOT_TOKEN; without retry, the first
  // emit lands in an empty registry.
  registerTelegramHandlers()
}
