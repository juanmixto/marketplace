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
  VendorApplicationApprovedPayload,
  VendorApplicationRejectedPayload,
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

/** Trim a user-supplied blob down to a preview and HTML-escape it. */
function previewText(body: string, max: number): string {
  const trimmed = body.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= max) return escapeHtml(trimmed)
  return escapeHtml(trimmed.slice(0, max - 1)) + '…'
}

/** First word of a multi-word name — used for greetings ("Hola María"). */
function firstWord(name?: string | null): string | undefined {
  if (!name) return undefined
  const trimmed = name.trim()
  if (!trimmed) return undefined
  const [first] = trimmed.split(/\s+/)
  return first
}

/**
 * Extra data that handlers can optionally resolve from the DB to make the
 * Telegram message readable for a human (human-friendly order number, city,
 * line-item summary, people's names). The template falls back to neutral
 * copy when these are absent so tests and any legacy callers keep working.
 */
export interface OrderMessageView {
  orderNumber?: string
  city?: string
  /** Structured list of items — rendered as one bullet per line. */
  items?: string[]
  /** Legacy single-string fallback. Prefer `items`. */
  itemSummary?: string
  /** Vendor's display name (shop name) or first name for greeting. */
  vendorFirstName?: string
  /** Buyer first name (used when we want to name-drop the customer). */
  buyerFirstName?: string
  /**
   * Full recipient name from the shipping address snapshot — i.e. the
   * human the producer is actually sending the parcel to. Preferred over
   * `payload.customerName` (which is the account holder's display name)
   * whenever available.
   */
  buyerName?: string
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

function vendorGreeting(view?: OrderMessageView): string {
  const name = firstWord(view?.vendorFirstName)
  return name ? `¡Hola ${escapeHtml(name)}! ` : ''
}

export function orderCreatedTemplate(
  payload: OrderCreatedPayload,
  view?: OrderMessageView,
): OutboundMessage {
  const id = orderIdentifierLink(payload, view)
  const customer = escapeHtml(view?.buyerName ?? payload.customerName)
  const total = formatMoney(payload.totalCents, payload.currency)
  const locationLine = view?.city ? ` desde ${escapeHtml(view.city)}` : ''
  const itemsBlock = renderItemsBlock(view)
  const greeting = vendorGreeting(view)
  const buttons: InlineKeyboardButton[] = []
  if (payload.fulfillmentId) {
    buttons.push({ text: '✅ Confirmar', callback_data: `confirmFulfillment:${payload.fulfillmentId}` })
  }
  buttons.push({ text: 'Ver pedido', url: `${appUrl()}/vendor/pedidos/${payload.orderId}` })
  return {
    text:
      `📦 ${greeting}tienes un pedido nuevo de <b>${customer}</b>${locationLine}.\n` +
      `Pedido <b>${id}</b> — ${total}${itemsBlock}`,
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
      ? 'Está esperando tu confirmación para ponerse en marcha.'
      : payload.reason === 'NEEDS_LABEL'
        ? 'Falta generar la etiqueta de envío para seguir adelante.'
        : 'Queda marcarlo como enviado cuando salga para reparto.'
  const buyerLine = view?.buyerFirstName
    ? ` de <b>${escapeHtml(view.buyerFirstName)}</b>`
    : ''
  const locationLine = view?.city ? ` · ${escapeHtml(view.city)}` : ''
  const itemsBlock = renderItemsBlock(view)
  const greeting = vendorGreeting(view)
  const buttons: InlineKeyboardButton[] = []
  if (payload.reason === 'NEEDS_LABEL' && payload.fulfillmentId) {
    buttons.push({ text: '🏷️ Generar etiqueta', callback_data: `prepareFulfillment:${payload.fulfillmentId}` })
  }
  if (payload.reason === 'NEEDS_SHIPMENT' && payload.fulfillmentId) {
    buttons.push({ text: '📦 Marcar enviado', callback_data: `markShipped:${payload.fulfillmentId}` })
  }
  buttons.push({ text: 'Ver', url: `${appUrl()}/vendor/pedidos/${payload.orderId}` })
  return {
    text:
      `⏳ ${greeting}el pedido <b>${id}</b>${buyerLine}${locationLine} te está esperando.\n` +
      `${reasonText}${itemsBlock}`,
    inline_keyboard: [buttons],
  }
}

export interface MessageReceivedView {
  vendorFirstName?: string
  /** Order number ("MP-2026-…") the conversation is about, if any. */
  orderNumber?: string
}

export function messageReceivedTemplate(
  payload: MessageReceivedPayload,
  view?: MessageReceivedView,
): OutboundMessage {
  const from = escapeHtml(payload.fromUserName)
  const preview = previewText(payload.preview, 140)
  const greeting = view?.vendorFirstName
    ? `¡Hola ${escapeHtml(firstWord(view.vendorFirstName) ?? '')}! `
    : ''
  const orderContext = view?.orderNumber
    ? ` sobre el pedido <b>${escapeHtml(view.orderNumber)}</b>`
    : ''
  return {
    text:
      `💬 ${greeting}<b>${from}</b> te ha escrito${orderContext}.\n` +
      `"${preview}"`,
    inline_keyboard: [[
      { text: 'Abrir chat', url: `${appUrl()}/vendor/pedidos` },
    ]],
  }
}

export function orderDeliveredTemplate(
  payload: OrderDeliveredPayload,
  view?: OrderMessageView,
): OutboundMessage {
  const id = orderIdentifierLink(payload, view)
  const locationLine = view?.city ? ` en ${escapeHtml(view.city)}` : ''
  const customer = view?.buyerFirstName
    ? ` <b>${escapeHtml(view.buyerFirstName)}</b> ya lo tiene en casa.`
    : ' El cliente ya lo tiene en casa.'
  const greeting = vendorGreeting(view)
  return {
    text:
      `✅ ${greeting}pedido <b>${id}</b> entregado${locationLine}.\n` +
      `${customer.trim()} ¡Buen trabajo!`,
    inline_keyboard: [[
      { text: 'Ver pedido', url: `${appUrl()}/vendor/pedidos/${payload.orderId}` },
    ]],
  }
}

export function labelFailedTemplate(
  payload: LabelFailedPayload,
  view?: OrderMessageView,
): OutboundMessage {
  const id = orderIdentifierLink(payload, view)
  const err = escapeHtml(payload.errorMessage.slice(0, 180))
  const buyerLine = view?.buyerFirstName
    ? ` del pedido de <b>${escapeHtml(view.buyerFirstName)}</b>`
    : ''
  const greeting = vendorGreeting(view)
  return {
    text:
      `⚠️ ${greeting}no hemos podido generar la etiqueta <b>${id}</b>${buyerLine}.\n` +
      `<i>${err}</i>\nPuedes reintentarlo desde aquí 👇`,
    inline_keyboard: [[
      { text: '🔁 Reintentar', callback_data: `prepareFulfillment:${payload.fulfillmentId}` },
      { text: 'Ver', url: `${appUrl()}/vendor/pedidos/${payload.orderId}` },
    ]],
  }
}

export interface IncidentView extends OrderMessageView {
  /** Snippet of the buyer's description of what went wrong. */
  descriptionPreview?: string
}

export function incidentOpenedTemplate(
  payload: IncidentOpenedPayload,
  view?: IncidentView,
): OutboundMessage {
  const id = orderIdentifierLink(payload, view)
  const type = escapeHtml(payload.type)
  const base = appUrl()
  const href = base
    ? `${base}/cuenta/incidencias/${payload.incidentId}`
    : `${appUrl()}/vendor/pedidos/${payload.orderId}`
  const buyer = view?.buyerFirstName
    ? ` <b>${escapeHtml(view.buyerFirstName)}</b>`
    : ' Un cliente'
  const descLine = view?.descriptionPreview
    ? `\n<i>"${previewText(view.descriptionPreview, 140)}"</i>`
    : ''
  const greeting = vendorGreeting(view)
  return {
    text:
      `🚨 ${greeting}${buyer.trim()} ha abierto una incidencia en el pedido <b>${id}</b>.\n` +
      `Motivo: ${type}${descLine}\nMejor resolverlo cuanto antes.`,
    inline_keyboard: [[
      { text: 'Abrir incidencia', url: href },
    ]],
  }
}

export interface ReviewView {
  vendorFirstName?: string
  reviewerFirstName?: string
  /** Snippet of the review body, if any. */
  commentPreview?: string
}

export function reviewReceivedTemplate(
  payload: ReviewReceivedPayload,
  view?: ReviewView,
): OutboundMessage {
  const stars = '★'.repeat(payload.rating) + '☆'.repeat(5 - payload.rating)
  const product = escapeHtml(payload.productName)
  const reviewer = view?.reviewerFirstName
    ? ` de <b>${escapeHtml(view.reviewerFirstName)}</b>`
    : ''
  const commentLine = view?.commentPreview
    ? `\n<i>"${previewText(view.commentPreview, 140)}"</i>`
    : ''
  const greeting = view?.vendorFirstName
    ? `¡Hola ${escapeHtml(firstWord(view.vendorFirstName) ?? '')}! `
    : ''
  const closer =
    payload.rating >= 4
      ? '¡Enhorabuena! 🎉'
      : payload.rating <= 2
        ? 'Échale un ojo cuando puedas.'
        : ''
  return {
    text:
      `⭐ ${greeting}nueva valoración${reviewer} ${stars}\n` +
      `${product}${commentLine}${closer ? `\n${closer}` : ''}`,
    inline_keyboard: [[
      { text: 'Ver valoración', url: `${appUrl()}/vendor/valoraciones` },
    ]],
  }
}

export interface PayoutView {
  vendorFirstName?: string
  /** How many orders were liquidated in this period. */
  orderCount?: number
}

export function payoutPaidTemplate(
  payload: PayoutPaidPayload,
  view?: PayoutView,
): OutboundMessage {
  const amount = formatMoney(payload.netPayableCents, payload.currency)
  const period = escapeHtml(payload.periodLabel)
  const greeting = view?.vendorFirstName
    ? `¡Hola ${escapeHtml(firstWord(view.vendorFirstName) ?? '')}! `
    : ''
  const orderLine =
    typeof view?.orderCount === 'number' && view.orderCount > 0
      ? `\n${view.orderCount} ${view.orderCount === 1 ? 'pedido liquidado' : 'pedidos liquidados'} en este periodo.`
      : ''
  return {
    text:
      `💶 ${greeting}liquidación pagada: <b>${amount}</b>\n` +
      `Periodo: ${period}${orderLine}`,
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
export interface BuyerStatusView {
  buyerFirstName?: string
  /** Items this buyer ordered — rendered under the status line. */
  items?: string[]
}

export function orderStatusChangedTemplate(
  payload: OrderStatusChangedPayload,
  view?: BuyerStatusView,
): OutboundMessage {
  const label = payload.orderNumber
    ? escapeHtml(payload.orderNumber)
    : `#${shortId(payload.orderId)}`
  const base = appUrl()
  const href = base ? `${base}/cuenta/pedidos/${payload.orderId}` : null
  const id = href ? `<a href="${escapeHtml(href)}">${label}</a>` : label
  const vendor = payload.vendorName ? ` de <b>${escapeHtml(payload.vendorName)}</b>` : ''
  const buyer = firstWord(view?.buyerFirstName)
  const greeting = buyer ? `¡Hola ${escapeHtml(buyer)}! ` : ''
  const { emoji, line } = buyerStatusCopy(payload.status)
  const items = view?.items ?? []
  const itemsBlock =
    items.length > 0
      ? `\n${items.map(i => `• ${escapeHtml(i)}`).join('\n')}`
      : ''
  const buttons: InlineKeyboardButton[] = []
  if (base) {
    buttons.push({ text: 'Ver pedido', url: `${base}/cuenta/pedidos/${payload.orderId}` })
  }
  return {
    text: `${emoji} ${greeting}tu pedido <b>${id}</b>${vendor}\n${line}${itemsBlock}`,
    inline_keyboard: buttons.length > 0 ? [buttons] : undefined,
  }
}

function buyerStatusCopy(status: OrderStatusChangedPayload['status']): {
  emoji: string
  line: string
} {
  switch (status) {
    case 'SHIPPED':
      return { emoji: '📦', line: 'Ya está en camino hacia ti.' }
    case 'OUT_FOR_DELIVERY':
      return { emoji: '🚚', line: 'Sale hoy para entrega. Prepara un hueco 😉' }
    case 'DELIVERED':
      return { emoji: '✅', line: 'Entregado. ¡Que lo disfrutes!' }
  }
}

export interface StockLowView {
  vendorFirstName?: string
}

export function stockLowTemplate(
  payload: StockLowPayload,
  view?: StockLowView,
): OutboundMessage {
  const product = escapeHtml(payload.productName)
  const emoji = payload.remainingStock === 0 ? '🚫' : '📉'
  const remaining =
    payload.remainingStock === 0
      ? 'Se ha agotado.'
      : `Quedan <b>${payload.remainingStock}</b> unidades.`
  const greeting = view?.vendorFirstName
    ? `¡Hola ${escapeHtml(firstWord(view.vendorFirstName) ?? '')}! `
    : ''
  const cta =
    payload.remainingStock === 0
      ? 'Reponlo cuando puedas para no perder ventas.'
      : 'Considera reponer pronto.'
  return {
    text: `${emoji} ${greeting}stock bajo en <b>${product}</b>.\n${remaining} ${cta}`,
    inline_keyboard: [[
      { text: '➕10 stock', callback_data: `addStock:${payload.productId}` },
      { text: 'Editar producto', url: `${appUrl()}/vendor/productos/${payload.productId}` },
    ]],
  }
}

export interface FavoriteBuyerView {
  buyerFirstName?: string
  /** Remaining stock — surfaces scarcity ("solo quedan 3"). */
  remainingStock?: number
}

/**
 * Buyer-facing message when a favourited product goes from out-of-stock
 * to available again. Links to the public product detail so the buyer
 * can add it to the cart in one tap.
 */
export function favoriteBackInStockTemplate(
  payload: FavoriteBackInStockPayload,
  view?: FavoriteBuyerView,
): OutboundMessage {
  const product = escapeHtml(payload.productName)
  const vendor = payload.vendorName ? ` de <b>${escapeHtml(payload.vendorName)}</b>` : ''
  const base = appUrl()
  const href = payload.productSlug && base
    ? `${base}/productos/${payload.productSlug}`
    : null
  const buyer = firstWord(view?.buyerFirstName)
  const scarcity =
    typeof view?.remainingStock === 'number' && view.remainingStock > 0 && view.remainingStock <= 5
      ? ` Solo quedan <b>${view.remainingStock}</b>, hazte con el tuyo.`
      : ''
  const buttons: InlineKeyboardButton[] = []
  if (href) buttons.push({ text: '🛒 Ver producto', url: href })
  return {
    text:
      `🎉 ¡Buenas noticias${buyer ? `, ${escapeHtml(buyer)}` : ''}! ` +
      `<b>${product}</b>${vendor} vuelve a estar disponible.${scarcity}`,
    inline_keyboard: buttons.length > 0 ? [buttons] : undefined,
  }
}

/**
 * Buyer-facing message when a favourited product gets a price reduction.
 * Includes the percentage drop and both prices so the buyer can eyeball
 * how meaningful the change is.
 */
export function favoritePriceDropTemplate(
  payload: FavoritePriceDropPayload,
  view?: FavoriteBuyerView,
): OutboundMessage {
  const product = escapeHtml(payload.productName)
  const vendor = payload.vendorName ? ` de <b>${escapeHtml(payload.vendorName)}</b>` : ''
  const oldPrice = formatMoney(payload.oldPriceCents, payload.currency)
  const newPrice = formatMoney(payload.newPriceCents, payload.currency)
  const pct = Math.round(
    ((payload.oldPriceCents - payload.newPriceCents) / payload.oldPriceCents) * 100,
  )
  const base = appUrl()
  const href = payload.productSlug && base
    ? `${base}/productos/${payload.productSlug}`
    : null
  const buyer = firstWord(view?.buyerFirstName)
  const greeting = buyer ? `${escapeHtml(buyer)}, ` : ''
  const scarcity =
    typeof view?.remainingStock === 'number' && view.remainingStock > 0 && view.remainingStock <= 5
      ? `\nSolo quedan <b>${view.remainingStock}</b> — no dura mucho.`
      : ''
  const buttons: InlineKeyboardButton[] = []
  if (href) buttons.push({ text: '🛒 Ver producto', url: href })
  return {
    text:
      `💸 ${greeting}<b>${product}</b>${vendor} ha bajado de precio.\n` +
      `<s>${oldPrice}</s> → <b>${newPrice}</b> (−${pct}%)${scarcity}`,
    inline_keyboard: buttons.length > 0 ? [buttons] : undefined,
  }
}

export interface VendorApplicationView {
  firstName?: string
}

export function vendorApplicationApprovedTemplate(
  payload: VendorApplicationApprovedPayload,
  view?: VendorApplicationView,
): OutboundMessage {
  const firstName = firstWord(view?.firstName)
  const vendor = escapeHtml(payload.displayName)
  return {
    text: firstName
      ? `🎉 ¡Enhorabuena, ${escapeHtml(firstName)}! Tu solicitud para <b>${vendor}</b> ha sido aprobada.\nYa puedes entrar a tu panel de productor.`
      : `🎉 ¡Enhorabuena! Tu solicitud para <b>${vendor}</b> ha sido aprobada.\nYa puedes entrar a tu panel de productor.`,
    inline_keyboard: [[
      { text: 'Ir al panel', url: `${appUrl()}/vendor/dashboard` },
    ]],
  }
}

export function vendorApplicationRejectedTemplate(
  payload: VendorApplicationRejectedPayload,
  view?: VendorApplicationView,
): OutboundMessage {
  const firstName = firstWord(view?.firstName)
  const vendor = escapeHtml(payload.displayName)
  return {
    text: firstName
      ? `Gracias, ${escapeHtml(firstName)}. Tu solicitud para <b>${vendor}</b> no ha podido aprobarse en este momento.\nSi quieres, puedes escribirnos y te contamos los siguientes pasos.`
      : `Gracias. Tu solicitud para <b>${vendor}</b> no ha podido aprobarse en este momento.\nSi quieres, puedes escribirnos y te contamos los siguientes pasos.`,
    inline_keyboard: [[
      { text: 'Contactar soporte', url: `${appUrl()}/contacto` },
    ]],
  }
}
