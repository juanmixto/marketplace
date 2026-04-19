import type {
  OrderCreatedPayload,
  OrderPendingPayload,
  MessageReceivedPayload,
  OrderDeliveredPayload,
  LabelFailedPayload,
  IncidentOpenedPayload,
  ReviewReceivedPayload,
  PayoutPaidPayload,
  StockLowPayload,
  OrderStatusChangedPayload,
  FavoriteBackInStockPayload,
  FavoritePriceDropPayload,
} from '../events'
import type { WebPushMessage } from './service'

/**
 * Browser push notifications are single-line `title` + short `body`
 * rendered by the OS, so these templates are deliberately tighter
 * than the Telegram ones — plain text, no HTML, a bullet-list of
 * items compressed to a single comma-separated line.
 *
 * Each template accepts an optional view object (resolved from the
 * DB by the handler) so we can greet people by name, surface the
 * counter-party, and show a one-line summary without changing the
 * frozen event payloads.
 */

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} ${currency}`
}

function shortId(id: string): string {
  return id.slice(-8).toUpperCase()
}

function firstWord(name?: string | null): string | undefined {
  if (!name) return undefined
  const trimmed = name.trim()
  if (!trimmed) return undefined
  return trimmed.split(/\s+/)[0]
}

function joinItems(items?: string[], max = 2): string {
  if (!items || items.length === 0) return ''
  const shown = items.slice(0, max).join(', ')
  return items.length > max ? `${shown}…` : shown
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`
}

export interface OrderPushView {
  orderNumber?: string
  city?: string
  items?: string[]
  vendorFirstName?: string
  buyerFirstName?: string
}

function orderIdLabel(payload: { orderId: string }, view?: OrderPushView): string {
  return view?.orderNumber ?? `#${shortId(payload.orderId)}`
}

export function orderCreatedPush(
  payload: OrderCreatedPayload,
  view?: OrderPushView,
): WebPushMessage {
  const total = formatMoney(payload.totalCents, payload.currency)
  const id = orderIdLabel(payload, view)
  const greet = firstWord(view?.vendorFirstName)
  const title = greet
    ? `📦 ${greet}, nuevo pedido de ${payload.customerName}`
    : `📦 Nuevo pedido de ${payload.customerName}`
  const itemsLine = joinItems(view?.items)
  const parts = [`${id} — ${total}`]
  if (view?.city) parts.push(view.city)
  if (itemsLine) parts.push(itemsLine)
  return {
    title,
    body: parts.join(' · '),
    url: `/vendor/pedidos/${payload.orderId}`,
    tag: `order-created-${payload.orderId}`,
  }
}

export function orderPendingPush(
  payload: OrderPendingPayload,
  view?: OrderPushView,
): WebPushMessage {
  const reasonLabel =
    payload.reason === 'NEEDS_CONFIRMATION'
      ? 'Esperando confirmación'
      : payload.reason === 'NEEDS_LABEL'
        ? 'Falta la etiqueta de envío'
        : 'Falta marcar como enviado'
  const id = orderIdLabel(payload, view)
  const greet = firstWord(view?.vendorFirstName)
  const buyer = view?.buyerFirstName ? ` de ${view.buyerFirstName}` : ''
  const title = greet
    ? `⏳ ${greet}, pedido ${id}${buyer} pendiente`
    : `⏳ Pedido ${id}${buyer} pendiente`
  return {
    title,
    body: reasonLabel,
    url: `/vendor/pedidos/${payload.orderId}`,
    tag: `order-pending-${payload.orderId}-${payload.reason}`,
  }
}

export interface MessagePushView {
  vendorFirstName?: string
  orderNumber?: string
}

export function messageReceivedPush(
  payload: MessageReceivedPayload,
  view?: MessagePushView,
): WebPushMessage {
  const greet = firstWord(view?.vendorFirstName)
  const prefix = greet ? `💬 ${greet}, ` : '💬 '
  const title = view?.orderNumber
    ? `${prefix}mensaje de ${payload.fromUserName} · ${view.orderNumber}`
    : `${prefix}mensaje de ${payload.fromUserName}`
  return {
    title,
    body: truncate(payload.preview, 120),
    url: `/vendor/pedidos`,
    tag: `conversation-${payload.conversationId}`,
  }
}

export function orderDeliveredPush(
  payload: OrderDeliveredPayload,
  view?: OrderPushView,
): WebPushMessage {
  const id = orderIdLabel(payload, view)
  const buyer = view?.buyerFirstName ?? 'el cliente'
  const where = view?.city ? ` en ${view.city}` : ''
  return {
    title: `✅ Pedido ${id} entregado`,
    body: `${buyer} ya lo tiene en casa${where}. ¡Buen trabajo!`,
    url: `/vendor/pedidos/${payload.orderId}`,
    tag: `order-delivered-${payload.orderId}`,
  }
}

export function labelFailedPush(
  payload: LabelFailedPayload,
  view?: OrderPushView,
): WebPushMessage {
  const id = orderIdLabel(payload, view)
  const buyer = view?.buyerFirstName ? ` (${view.buyerFirstName})` : ''
  return {
    title: `⚠️ Falló la etiqueta ${id}${buyer}`,
    body: truncate(payload.errorMessage, 120),
    url: `/vendor/pedidos/${payload.orderId}`,
    tag: `label-failed-${payload.orderId}`,
  }
}

export interface IncidentPushView extends OrderPushView {
  descriptionPreview?: string
}

export function incidentOpenedPush(
  payload: IncidentOpenedPayload,
  view?: IncidentPushView,
): WebPushMessage {
  const id = orderIdLabel(payload, view)
  const buyer = view?.buyerFirstName ?? 'un cliente'
  const body = view?.descriptionPreview
    ? truncate(view.descriptionPreview, 120)
    : `Motivo: ${payload.type}`
  return {
    title: `🚨 Incidencia abierta · pedido ${id}`,
    body: `${buyer}: ${body}`,
    url: `/cuenta/incidencias/${payload.incidentId}`,
    tag: `incident-${payload.incidentId}`,
  }
}

export interface ReviewPushView {
  vendorFirstName?: string
  reviewerFirstName?: string
  commentPreview?: string
}

export function reviewReceivedPush(
  payload: ReviewReceivedPayload,
  view?: ReviewPushView,
): WebPushMessage {
  const stars = '★'.repeat(payload.rating) + '☆'.repeat(5 - payload.rating)
  const by = view?.reviewerFirstName ? ` de ${view.reviewerFirstName}` : ''
  const body = view?.commentPreview
    ? `${payload.productName} · "${truncate(view.commentPreview, 80)}"`
    : payload.productName
  return {
    title: `⭐ Valoración ${stars}${by}`,
    body,
    url: `/vendor/valoraciones`,
    tag: `review-${payload.reviewId}`,
  }
}

export interface PayoutPushView {
  vendorFirstName?: string
  orderCount?: number
}

export function payoutPaidPush(
  payload: PayoutPaidPayload,
  view?: PayoutPushView,
): WebPushMessage {
  const amount = formatMoney(payload.netPayableCents, payload.currency)
  const greet = firstWord(view?.vendorFirstName)
  const orderTail =
    typeof view?.orderCount === 'number' && view.orderCount > 0
      ? ` · ${view.orderCount} ${view.orderCount === 1 ? 'pedido' : 'pedidos'}`
      : ''
  return {
    title: greet ? `💶 ${greet}, liquidación pagada` : '💶 Liquidación pagada',
    body: `${amount} · ${payload.periodLabel}${orderTail}`,
    url: `/vendor/liquidaciones`,
    tag: `payout-${payload.settlementId}`,
  }
}

export interface StockLowPushView {
  vendorFirstName?: string
}

export function stockLowPush(
  payload: StockLowPayload,
  view?: StockLowPushView,
): WebPushMessage {
  const greet = firstWord(view?.vendorFirstName)
  const emoji = payload.remainingStock === 0 ? '🚫' : '📉'
  const tail =
    payload.remainingStock === 0
      ? 'Agotado.'
      : `Quedan ${payload.remainingStock}.`
  return {
    title: greet ? `${emoji} ${greet}, stock bajo` : `${emoji} Stock bajo`,
    body: `${payload.productName} · ${tail}`,
    url: `/vendor/productos`,
    tag: `stock-low-${payload.productId}`,
  }
}

export interface BuyerStatusPushView {
  buyerFirstName?: string
  items?: string[]
}

export function orderStatusChangedPush(
  payload: OrderStatusChangedPayload,
  view?: BuyerStatusPushView,
): WebPushMessage {
  const label = payload.orderNumber ?? `#${shortId(payload.orderId)}`
  const vendor = payload.vendorName ? ` · ${payload.vendorName}` : ''
  const greet = firstWord(view?.buyerFirstName)
  const itemsLine = joinItems(view?.items, 2)
  const { emoji, summary } = buyerStatusCopy(payload.status)
  const title = greet
    ? `${emoji} ${greet}, ${summary.toLowerCase()}`
    : `${emoji} ${summary}`
  const bodyParts = [`Pedido ${label}${vendor}`]
  if (itemsLine) bodyParts.push(itemsLine)
  return {
    title,
    body: bodyParts.join(' · '),
    url: `/cuenta/pedidos/${payload.orderId}`,
    tag: `order-status-${payload.orderId}-${payload.status}`,
  }
}

function buyerStatusCopy(status: OrderStatusChangedPayload['status']): {
  emoji: string
  summary: string
} {
  switch (status) {
    case 'SHIPPED':
      return { emoji: '📦', summary: 'Tu pedido va en camino' }
    case 'OUT_FOR_DELIVERY':
      return { emoji: '🚚', summary: 'Sale para entrega hoy' }
    case 'DELIVERED':
      return { emoji: '✅', summary: '¡Pedido entregado!' }
  }
}

export interface FavoriteBuyerPushView {
  buyerFirstName?: string
  remainingStock?: number
}

export function favoriteBackInStockPush(
  payload: FavoriteBackInStockPayload,
  view?: FavoriteBuyerPushView,
): WebPushMessage {
  const greet = firstWord(view?.buyerFirstName)
  const vendor = payload.vendorName ? ` · ${payload.vendorName}` : ''
  const scarcity =
    typeof view?.remainingStock === 'number' &&
    view.remainingStock > 0 &&
    view.remainingStock <= 5
      ? ` Solo quedan ${view.remainingStock}.`
      : ''
  const title = greet
    ? `🎉 ${greet}, tu favorito vuelve`
    : `🎉 Tu favorito vuelve a estar disponible`
  const slugUrl = payload.productSlug ? `/productos/${payload.productSlug}` : '/productos'
  return {
    title,
    body: `${payload.productName}${vendor}.${scarcity}`,
    url: slugUrl,
    tag: `favorite-restock-${payload.productId}`,
  }
}

export function favoritePriceDropPush(
  payload: FavoritePriceDropPayload,
  view?: FavoriteBuyerPushView,
): WebPushMessage {
  const oldPrice = formatMoney(payload.oldPriceCents, payload.currency)
  const newPrice = formatMoney(payload.newPriceCents, payload.currency)
  const pct = Math.round(
    ((payload.oldPriceCents - payload.newPriceCents) / payload.oldPriceCents) * 100,
  )
  const greet = firstWord(view?.buyerFirstName)
  const vendor = payload.vendorName ? ` · ${payload.vendorName}` : ''
  const scarcity =
    typeof view?.remainingStock === 'number' &&
    view.remainingStock > 0 &&
    view.remainingStock <= 5
      ? ` Solo quedan ${view.remainingStock}.`
      : ''
  const title = greet
    ? `💸 ${greet}, bajada de precio`
    : `💸 Ha bajado un favorito`
  const slugUrl = payload.productSlug ? `/productos/${payload.productSlug}` : '/productos'
  return {
    title,
    body: `${payload.productName}${vendor} · ${oldPrice} → ${newPrice} (−${pct}%)${scarcity}`,
    url: slugUrl,
    tag: `favorite-pricedrop-${payload.productId}`,
  }
}
