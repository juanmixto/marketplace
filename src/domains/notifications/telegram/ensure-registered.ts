import { registerTelegramHandlers } from './handlers/register'

let registered = false

export function ensureTelegramHandlersRegistered(): void {
  if (registered) return
  registered = true
  registerTelegramHandlers()
}
