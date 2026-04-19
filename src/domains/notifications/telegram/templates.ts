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
} from '../events'
import type { InlineKeyboardButton, OutboundMessage } from './service'

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatMoney(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2).replace('.', ',')
  return `${amount} ${currency}`
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? ''
}

function shortId(id: string): string {
  return id.slice(-8).toUpperCase()
}

/**
 * Extra data that handlers can optionally resolve from the DB to make the
 * Telegram message readable for a human (human-friendly order number, city,
 * line-item summary). The template falls back to a short CUID hash when
 * these are absent so tests and any legacy callers keep working.
 */
export interface OrderMessageView {
  orderNumber?: string
  city?: string
  /** Structured list of items — rendered as one bullet per line. */
  items?: string[]
  /** Legacy single-string fallback. Prefer `items`. */
  itemSummary?: string
}

/**
 * Renders the order identifier as a clickable HTML link so Telegram does
 * not detect strings like `MP-2026-985425` as a phone number and offer
 * "Copiar número de teléfono". The link opens the vendor order detail.
 */
function orderIdentifierLink(payload: { orderId: string }, view?: OrderMessageView): string {
  const label = view?.orderNumber ?? `#${shortId(payload.orderId)}`
  const base = appUrl()
  const href = base ? `${base}/vendor/pedidos/${payload.orderId}` : null
  return href ? `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>` : escapeHtml(label)
}

function renderItemsBlock(view?: OrderMessageView): string {
  const items = view?.items ?? []
  if (items.length === 0) {
    return view?.itemSummary ? `\n${escapeHtml(view.itemSummary)}` : ''
  }
  const lines = items.map(i => `• ${escapeHtml(i)}`).join('\n')
  return `\n${lines}`
}

export function orderCreatedTemplate(
  payload: OrderCreatedPayload,
  view?: OrderMessageView,
): OutboundMessage {
  const id = orderIdentifierLink(payload, view)
  const customer = escapeHtml(payload.customerName)
  const total = formatMoney(payload.totalCents, payload.currency)
  const locationLine = view?.city ? ` · ${escapeHtml(view.city)}` : ''
  const itemsBlock = renderItemsBlock(view)
  const buttons: InlineKeyboardButton[] = []
  if (payload.fulfillmentId) {
    buttons.push({ text: '✅ Confirmar', callback_data: `confirmFulfillment:${payload.fulfillmentId}` })
  }
  buttons.push({ text: 'Ver', url: `${appUrl()}/vendor/pedidos/${payload.orderId}` })
  return {
    text: `📦 Nuevo pedido <b>${id}</b>\n${customer}${locationLine} — ${total}${itemsBlock}`,
    inline_keyboard: [buttons],
  }
}

export function orderPendingTemplate(
  payload: OrderPendingPayload,
  view?: OrderMessageView,
): OutboundMessage {
  const id = orderIdentifierLink(payload, view)
  const reasonText =
    payload.reason === 'NEEDS_CONFIRMATION'
      ? 'Esperando confirmación.'
      : payload.reason === 'NEEDS_LABEL'
        ? 'Pendiente de generar etiqueta de envío.'
        : 'Pendiente de marcar como enviado.'
  const locationLine = view?.city ? ` · ${escapeHtml(view.city)}` : ''
  const itemsBlock = renderItemsBlock(view)
  const buttons: InlineKeyboardButton[] = []
  if (payload.reason === 'NEEDS_LABEL' && payload.fulfillmentId) {
    buttons.push({ text: '🏷️ Generar etiqueta', callback_data: `prepareFulfillment:${payload.fulfillmentId}` })
  }
  if (payload.reason === 'NEEDS_SHIPMENT' && payload.fulfillmentId) {
    buttons.push({ text: '📦 Marcar enviado', callback_data: `markShipped:${payload.fulfillmentId}` })
  }
  buttons.push({ text: 'Ver', url: `${appUrl()}/vendor/pedidos/${payload.orderId}` })
  return {
    text: `⏳ Pedido <b>${id}</b>${locationLine}\n${reasonText}${itemsBlock}`,
    inline_keyboard: [buttons],
  }
}

export function messageReceivedTemplate(payload: MessageReceivedPayload): OutboundMessage {
  const from = escapeHtml(payload.fromUserName)
  const preview = escapeHtml(payload.preview.slice(0, 120))
  return {
    text: `💬 Mensaje de <b>${from}</b>\n"${preview}"`,
    inline_keyboard: [[
      { text: 'Abrir', url: `${appUrl()}/vendor/pedidos` },
    ]],
  }
}

export function orderDeliveredTemplate(
  payload: OrderDeliveredPayload,
  view?: OrderMessageView,
): OutboundMessage {
  const id = orderIdentifierLink(payload, view)
  const locationLine = view?.city ? ` · ${escapeHtml(view.city)}` : ''
  return {
    text: `✅ Pedido <b>${id}</b>${locationLine}\nEntregado al cliente.`,
    inline_keyboard: [[
      { text: 'Ver', url: `${appUrl()}/vendor/pedidos/${payload.orderId}` },
    ]],
  }
}

export function labelFailedTemplate(
  payload: LabelFailedPayload,
  view?: OrderMessageView,
): OutboundMessage {
  const id = orderIdentifierLink(payload, view)
  const err = escapeHtml(payload.errorMessage.slice(0, 180))
  return {
    text: `⚠️ Falló la etiqueta del pedido <b>${id}</b>\n<i>${err}</i>`,
    inline_keyboard: [[
      { text: '🔁 Reintentar', callback_data: `prepareFulfillment:${payload.fulfillmentId}` },
      { text: 'Ver', url: `${appUrl()}/vendor/pedidos/${payload.orderId}` },
    ]],
  }
}

export function incidentOpenedTemplate(
  payload: IncidentOpenedPayload,
  view?: OrderMessageView,
): OutboundMessage {
  const id = orderIdentifierLink(payload, view)
  const type = escapeHtml(payload.type)
  const base = appUrl()
  const href = base
    ? `${base}/cuenta/incidencias/${payload.incidentId}`
    : `${appUrl()}/vendor/pedidos/${payload.orderId}`
  return {
    text: `🚨 Incidencia abierta en pedido <b>${id}</b>\nMotivo: ${type}`,
    inline_keyboard: [[
      { text: 'Abrir incidencia', url: href },
    ]],
  }
}

export function reviewReceivedTemplate(payload: ReviewReceivedPayload): OutboundMessage {
  const stars = '★'.repeat(payload.rating) + '☆'.repeat(5 - payload.rating)
  const product = escapeHtml(payload.productName)
  return {
    text: `⭐ Nueva valoración ${stars}\n${product}`,
    inline_keyboard: [[
      { text: 'Ver valoración', url: `${appUrl()}/vendor/valoraciones` },
    ]],
  }
}

export function payoutPaidTemplate(payload: PayoutPaidPayload): OutboundMessage {
  const amount = formatMoney(payload.netPayableCents, payload.currency)
  const period = escapeHtml(payload.periodLabel)
  return {
    text: `💶 Liquidación pagada\n<b>${amount}</b> · ${period}`,
    inline_keyboard: [[
      { text: 'Ver liquidaciones', url: `${appUrl()}/vendor/liquidaciones` },
    ]],
  }
}

/**
 * Buyer-facing message when a shipment in their order transitions
 * through SHIPPED / OUT_FOR_DELIVERY / DELIVERED. Links to the buyer
 * order detail, not the vendor view.
 */
export function orderStatusChangedTemplate(
  payload: OrderStatusChangedPayload,
): OutboundMessage {
  const label = payload.orderNumber
    ? escapeHtml(payload.orderNumber)
    : `#${shortId(payload.orderId)}`
  const base = appUrl()
  const href = base ? `${base}/cuenta/pedidos/${payload.orderId}` : null
  const id = href ? `<a href="${escapeHtml(href)}">${label}</a>` : label
  const vendor = payload.vendorName ? ` — ${escapeHtml(payload.vendorName)}` : ''
  const { emoji, line } = buyerStatusCopy(payload.status)
  const buttons: InlineKeyboardButton[] = []
  if (base) {
    buttons.push({ text: 'Ver pedido', url: `${base}/cuenta/pedidos/${payload.orderId}` })
  }
  return {
    text: `${emoji} Tu pedido <b>${id}</b>${vendor}\n${line}`,
    inline_keyboard: buttons.length > 0 ? [buttons] : undefined,
  }
}

function buyerStatusCopy(status: OrderStatusChangedPayload['status']): {
  emoji: string
  line: string
} {
  switch (status) {
    case 'SHIPPED':
      return { emoji: '📦', line: 'Ya está en camino.' }
    case 'OUT_FOR_DELIVERY':
      return { emoji: '🚚', line: 'Sale para entrega hoy.' }
    case 'DELIVERED':
      return { emoji: '✅', line: 'Entregado. ¡Que lo disfrutes!' }
  }
}

export function stockLowTemplate(payload: StockLowPayload): OutboundMessage {
  const product = escapeHtml(payload.productName)
  const emoji = payload.remainingStock === 0 ? '🚫' : '📉'
  const remaining =
    payload.remainingStock === 0
      ? 'Agotado.'
      : `Quedan <b>${payload.remainingStock}</b>.`
  return {
    text: `${emoji} Stock bajo: ${product}\n${remaining}`,
    inline_keyboard: [[
      { text: 'Ver producto', url: `${appUrl()}/vendor/productos` },
    ]],
  }
}

/**
 * Buyer-facing message when a favourited product goes from out-of-stock
 * to available again. Links to the public product detail so the buyer
 * can add it to the cart in one tap.
 */
export function favoriteBackInStockTemplate(
  payload: FavoriteBackInStockPayload,
): OutboundMessage {
  const product = escapeHtml(payload.productName)
  const vendor = payload.vendorName ? ` — ${escapeHtml(payload.vendorName)}` : ''
  const base = appUrl()
  const href = payload.productSlug && base
    ? `${base}/productos/${payload.productSlug}`
    : null
  const buttons: InlineKeyboardButton[] = []
  if (href) buttons.push({ text: '🛒 Ver producto', url: href })
  return {
    text: `🎉 <b>${product}</b>${vendor} vuelve a estar disponible.`,
    inline_keyboard: buttons.length > 0 ? [buttons] : undefined,
  }
}
