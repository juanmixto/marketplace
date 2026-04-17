import type {
  OrderCreatedPayload,
  OrderPendingPayload,
  MessageReceivedPayload,
} from '../events'
import type { OutboundMessage } from './service'

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

export function orderCreatedTemplate(payload: OrderCreatedPayload): OutboundMessage {
  const id = shortId(payload.orderId)
  const customer = escapeHtml(payload.customerName)
  const total = formatMoney(payload.totalCents, payload.currency)
  return {
    text: `📦 Nuevo pedido <b>#${id}</b>\n${customer} — ${total}`,
    inline_keyboard: [[
      { text: 'Ver', url: `${appUrl()}/vendor/pedidos/${payload.orderId}` },
    ]],
  }
}

export function orderPendingTemplate(payload: OrderPendingPayload): OutboundMessage {
  const id = shortId(payload.orderId)
  const reasonText =
    payload.reason === 'NEEDS_CONFIRMATION'
      ? 'Esperando confirmación.'
      : 'Pendiente de enviar.'
  return {
    text: `⏳ Pedido <b>#${id}</b>\n${reasonText}`,
    inline_keyboard: [[
      { text: 'Ver', url: `${appUrl()}/vendor/pedidos/${payload.orderId}` },
    ]],
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
