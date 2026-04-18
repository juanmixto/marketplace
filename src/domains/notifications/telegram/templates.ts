import type {
  OrderCreatedPayload,
  OrderPendingPayload,
  MessageReceivedPayload,
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

function appLink(path: string): string | null {
  const base = appUrl()
  if (!base) return null
  return `${base}${path}`
}

function shortId(id: string): string {
  return id.slice(-8).toUpperCase()
}

function appendUrlButton(
  row: InlineKeyboardButton[],
  text: string,
  path: string,
): void {
  const url = appLink(path)
  if (url) row.push({ text, url })
}

export function orderCreatedTemplate(payload: OrderCreatedPayload): OutboundMessage {
  const id = shortId(payload.orderId)
  const customer = escapeHtml(payload.customerName)
  const total = formatMoney(payload.totalCents, payload.currency)
  const buttons: InlineKeyboardButton[] = []
  if (payload.fulfillmentId) {
    buttons.push({ text: '✅ Confirmar', callback_data: `confirmFulfillment:${payload.fulfillmentId}` })
  }
  appendUrlButton(buttons, 'Ver', `/vendor/pedidos/${payload.orderId}`)
  return {
    text: `📦 Nuevo pedido <b>#${id}</b>\n${customer} — ${total}`,
    inline_keyboard: buttons.length > 0 ? [buttons] : undefined,
  }
}

export function orderPendingTemplate(payload: OrderPendingPayload): OutboundMessage {
  const id = shortId(payload.orderId)
  const reasonText =
    payload.reason === 'NEEDS_CONFIRMATION'
      ? 'Esperando confirmación.'
      : 'Pendiente de enviar.'
  const buttons: InlineKeyboardButton[] = []
  if (payload.reason === 'NEEDS_SHIPMENT' && payload.fulfillmentId) {
    buttons.push({ text: '📦 Marcar enviado', callback_data: `markShipped:${payload.fulfillmentId}` })
  }
  appendUrlButton(buttons, 'Ver', `/vendor/pedidos/${payload.orderId}`)
  return {
    text: `⏳ Pedido <b>#${id}</b>\n${reasonText}`,
    inline_keyboard: buttons.length > 0 ? [buttons] : undefined,
  }
}

export function messageReceivedTemplate(payload: MessageReceivedPayload): OutboundMessage {
  const from = escapeHtml(payload.fromUserName)
  const preview = escapeHtml(payload.preview.slice(0, 120))
  const buttons: InlineKeyboardButton[] = []
  appendUrlButton(buttons, 'Abrir', '/vendor/pedidos')
  return {
    text: `💬 Mensaje de <b>${from}</b>\n"${preview}"`,
    inline_keyboard: buttons.length > 0 ? [buttons] : undefined,
  }
}

export function helpTemplate(botUsername: string): OutboundMessage {
  const buttons: InlineKeyboardButton[] = []
  appendUrlButton(buttons, 'Abrir ajustes', '/vendor/ajustes/telegram')
  appendUrlButton(buttons, 'Ver notificaciones', '/vendor/ajustes/notificaciones')

  return {
    text: [
      '<b>Comandos disponibles</b>',
      '',
      '/start <i>&lt;token&gt;</i> — vincula tu cuenta (genera el token en Ajustes → Telegram).',
      '/status — mira si esta cuenta está vinculada y abre tus ajustes.',
      '/disconnect — desvincula la cuenta de este chat.',
      '/help — muestra este mensaje.',
      '',
      `Bot: @${escapeHtml(botUsername)}`,
    ].join('\n'),
    inline_keyboard: buttons.length > 0 ? [buttons] : undefined,
  }
}

export function statusTemplate(payload: {
  linked: boolean
  username: string | null
  botUsername: string
}): OutboundMessage {
  const buttons: InlineKeyboardButton[] = []
  const headline = payload.linked ? '✅ Cuenta vinculada' : '⚠️ Cuenta no vinculada'
  const lines = [headline]

  if (payload.linked) {
    if (payload.username) {
      lines.push(`Conectado como @${escapeHtml(payload.username)}.`)
    } else {
      lines.push('Conectado correctamente.')
    }
    lines.push('Desde la web puedes cambiar avisos, revisar pedidos y desconectar Telegram cuando quieras.')
    appendUrlButton(buttons, 'Ver notificaciones', '/vendor/ajustes/notificaciones')
    appendUrlButton(buttons, 'Abrir Telegram', '/vendor/ajustes/telegram')
  } else {
    lines.push('Genera un enlace desde Ajustes → Telegram y envía /start <token> para vincular esta cuenta.')
    appendUrlButton(buttons, 'Abrir ajustes', '/vendor/ajustes/telegram')
    appendUrlButton(buttons, 'Ver notificaciones', '/vendor/ajustes/notificaciones')
  }

  lines.push('')
  lines.push(`Bot: @${escapeHtml(payload.botUsername)}`)

  return {
    text: lines.join('\n'),
    inline_keyboard: buttons.length > 0 ? [buttons] : undefined,
  }
}
