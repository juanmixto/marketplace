import { on } from '../../dispatcher'
import { onBuyerOrderConfirmed } from './on-buyer-order-confirmed'
import { onBuyerOrderShipped } from './on-buyer-order-shipped'

const GLOBAL_KEY = '__marketplaceEmailHandlersRegistered'

type GlobalWithFlag = typeof globalThis & { [GLOBAL_KEY]?: boolean }

/**
 * Idempotent registration of the buyer-facing email handlers. Mirrors
 * the telegram + web-push register pattern. Unlike the telegram one we
 * don't gate on env config — `sendEmail` is itself a no-op when
 * RESEND_API_KEY is missing, so registration is always safe.
 */
export function registerEmailHandlers(): void {
  const g = globalThis as GlobalWithFlag
  if (g[GLOBAL_KEY]) return

  on('order.buyer_confirmed', onBuyerOrderConfirmed)
  on('order.status_changed', onBuyerOrderShipped)

  g[GLOBAL_KEY] = true
}
