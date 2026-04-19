import { on } from '../../dispatcher'
import { isPushEnabled } from '@/lib/pwa/push-config'
import { onOrderCreated } from './on-order-created'
import { onOrderPending } from './on-order-pending'
import { onMessageReceived } from './on-message-received'
import { onBuyerOrderStatus } from './on-buyer-order-status'
import { onFavoriteBackInStock } from './on-favorite-restock'
import { onFavoritePriceDrop } from './on-favorite-price-drop'
import {
  onOrderDelivered,
  onLabelFailed,
  onIncidentOpened,
  onReviewReceived,
  onPayoutPaid,
  onStockLow,
} from './on-vendor-alerts'

const GLOBAL_KEY = '__marketplaceWebPushHandlersRegistered'

type GlobalWithFlag = typeof globalThis & { [GLOBAL_KEY]?: boolean }

/**
 * Subscribes every web-push handler to the shared notification
 * dispatcher. Idempotent — the global flag guarantees a single
 * subscription even when imported from several server entry points
 * (same pattern Telegram uses). Short-circuits when VAPID is not
 * configured so preview / dev builds with no push keys don't open
 * the registration at all.
 */
export function registerWebPushHandlers(): void {
  const g = globalThis as GlobalWithFlag
  if (g[GLOBAL_KEY]) return
  if (!isPushEnabled) return

  on('order.created', onOrderCreated)
  on('order.pending', onOrderPending)
  on('message.received', onMessageReceived)
  on('order.delivered', onOrderDelivered)
  on('label.failed', onLabelFailed)
  on('incident.opened', onIncidentOpened)
  on('review.received', onReviewReceived)
  on('payout.paid', onPayoutPaid)
  on('stock.low', onStockLow)
  on('order.status_changed', onBuyerOrderStatus)
  on('favorite.back_in_stock', onFavoriteBackInStock)
  on('favorite.price_drop', onFavoritePriceDrop)

  g[GLOBAL_KEY] = true
}
