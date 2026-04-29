import { registerEmailHandlers } from './handlers/register'

export function ensureEmailHandlersRegistered(): void {
  registerEmailHandlers()
}
