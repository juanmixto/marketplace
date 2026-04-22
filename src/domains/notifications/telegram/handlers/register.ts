import { on } from '../../dispatcher'
import { getTelegramConfig } from '../config'
import { onOrderCreated } from './on-order-created'
import { onBuyerOrderStatus } from './on-buyer-order-status'
import { onFavoriteBackInStock } from './on-favorite-restock'
import { onFavoritePriceDrop } from './on-favorite-price-drop'
import { onOrderPending } from './on-order-pending'
import { onMessageReceived } from './on-message-received'
import {
  onOrderDelivered,
  onLabelFailed,
  onIncidentOpened,
  onReviewReceived,
  onPayoutPaid,
  onStockLow,
} from './on-vendor-alerts'
import { onVendorApplicationApproved, onVendorApplicationRejected } from './on-vendor-application'
import { registerAction } from '../actions/registry'
import { confirmFulfillmentAction } from '../actions/confirm-fulfillment'
import { markShippedAction } from '../actions/mark-shipped'
import { prepareFulfillmentAction } from '../actions/prepare-fulfillment'
import { addStockAction } from '../actions/add-stock'

const GLOBAL_KEY = '__marketplaceTelegramHandlersRegistered'

type GlobalWithFlag = typeof globalThis & { [GLOBAL_KEY]?: boolean }

export function registerTelegramHandlers(): void {
  const g = globalThis as GlobalWithFlag
  if (g[GLOBAL_KEY]) return
  if (!getTelegramConfig()) return

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
  on('vendor.application.approved', onVendorApplicationApproved)
  on('vendor.application.rejected', onVendorApplicationRejected)

  registerAction('confirmFulfillment', confirmFulfillmentAction)
  registerAction('markShipped', markShippedAction)
  registerAction('prepareFulfillment', prepareFulfillmentAction)
  registerAction('addStock', addStockAction)

  g[GLOBAL_KEY] = true
}
