import { db } from '@/lib/db'
import { callBotApi, TelegramApiError } from './client'
import { checkRateLimit } from './rate-limit'
import type { NotificationEventType } from '../types'

export type InlineKeyboardButton =
  | { text: string; callback_data: string }
  | { text: string; url: string }

export type OutboundMessage = {
  text: string
  inline_keyboard?: InlineKeyboardButton[][]
}

type SendOutcome =
  | { status: 'SENT' }
  | { status: 'SKIPPED'; reason: string }
  | { status: 'FAILED'; error: string }

export async function sendToUser(
  userId: string,
  eventType: NotificationEventType,
  message: OutboundMessage,
  options: { payloadRef?: string } = {},
): Promise<SendOutcome> {
  const link = await db.telegramLink.findUnique({
    where: { userId },
    select: { chatId: true, isActive: true },
  })

  if (!link || !link.isActive) {
    await logDelivery(userId, eventType, 'SKIPPED', 'NO_ACTIVE_LINK', options.payloadRef)
    return { status: 'SKIPPED', reason: 'NO_ACTIVE_LINK' }
  }

  const pref = await db.notificationPreference.findUnique({
    where: {
      userId_channel_eventType: {
        userId,
        channel: 'TELEGRAM',
        eventType,
      },
    },
    select: { enabled: true },
  })
  if (pref && !pref.enabled) {
    await logDelivery(userId, eventType, 'SKIPPED', 'USER_DISABLED', options.payloadRef)
    return { status: 'SKIPPED', reason: 'USER_DISABLED' }
  }

  if (!checkRateLimit(userId)) {
    await logDelivery(userId, eventType, 'SKIPPED', 'RATE_LIMITED', options.payloadRef)
    return { status: 'SKIPPED', reason: 'RATE_LIMITED' }
  }

  try {
    await sendRawMessage(link.chatId, message)
    await logDelivery(userId, eventType, 'SENT', null, options.payloadRef)
    return { status: 'SENT' }
  } catch (err) {
    const errorDescription = err instanceof Error ? err.message : String(err)
    await logDelivery(userId, eventType, 'FAILED', errorDescription, options.payloadRef)

    if (err instanceof TelegramApiError && err.errorCode === 403) {
      await db.telegramLink.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      })
      console.warn('telegram.outbound.user_blocked_bot', { userId })
    }

    console.error('telegram.outbound.failed', { userId, eventType, error: errorDescription })
    return { status: 'FAILED', error: errorDescription }
  }
}

export async function sendRawMessage(
  chatId: string,
  message: OutboundMessage,
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: message.text,
    parse_mode: 'HTML',
    // Order messages embed a link to the detail page as the identifier
    // (`MP-2026-…`). Without this flag Telegram renders the OpenGraph
    // preview of the landing page and the card dwarfs the actionable
    // content. Keep both the legacy and v7+ parameter so older Bot API
    // deployments (and Telegram desktop clients that cache previews
    // aggressively) honour the disable flag.
    disable_web_page_preview: true,
    link_preview_options: { is_disabled: true },
  }
  if (message.inline_keyboard && message.inline_keyboard.length > 0) {
    body.reply_markup = { inline_keyboard: message.inline_keyboard }
  }
  await callBotApi('sendMessage', body)
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await callBotApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  })
}

export async function editMessageRemoveKeyboard(
  chatId: string,
  messageId: number,
  newText?: string,
): Promise<void> {
  if (newText) {
    await callBotApi('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: newText,
      parse_mode: 'HTML',
    })
  } else {
    await callBotApi('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
    })
  }
}

async function logDelivery(
  userId: string,
  eventType: NotificationEventType,
  status: 'SENT' | 'FAILED' | 'SKIPPED',
  error: string | null,
  payloadRef: string | undefined,
): Promise<void> {
  try {
    await db.notificationDelivery.create({
      data: {
        userId,
        channel: 'TELEGRAM',
        eventType,
        status,
        error,
        payloadRef: payloadRef ?? null,
      },
    })
  } catch (err) {
    console.error('telegram.outbound.log_failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
