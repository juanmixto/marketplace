import { on } from '../../dispatcher'
import { getTelegramConfig } from '../config'
import { onOrderCreated } from './on-order-created'
import { onOrderPending } from './on-order-pending'
import { onMessageReceived } from './on-message-received'

const GLOBAL_KEY = '__marketplaceTelegramHandlersRegistered'

type GlobalWithFlag = typeof globalThis & { [GLOBAL_KEY]?: boolean }

export function registerTelegramHandlers(): void {
  const g = globalThis as GlobalWithFlag
  if (g[GLOBAL_KEY]) return
  if (!getTelegramConfig()) return

  on('order.created', onOrderCreated)
  on('order.pending', onOrderPending)
  on('message.received', onMessageReceived)
  g[GLOBAL_KEY] = true
}
