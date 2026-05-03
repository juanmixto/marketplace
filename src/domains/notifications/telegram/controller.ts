import { logger } from '@/lib/logger'
import type { TelegramUpdate } from './update-schema'

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  if (update.message) {
    await handleMessage(update.message)
    return
  }
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query)
    return
  }
  console.info('telegram.webhook.unknown_update', { updateId: update.update_id })
}

async function handleMessage(message: NonNullable<TelegramUpdate['message']>): Promise<void> {
  const text = message.text?.trim()
  if (!text) {
    logger.warn('notifications.handler.skipped', {
      event: 'telegram.message',
      reason: 'no_text',
      handler: 'telegram.controller.handle-message',
      chatId: message.chat.id,
    })
    return
  }

  if (text.startsWith('/start')) {
    const { handleStartCommand } = await import('./handlers/on-start-command')
    await handleStartCommand(message)
    return
  }

  if (text === '/disconnect') {
    const { handleDisconnectCommand } = await import('./handlers/on-disconnect-command')
    await handleDisconnectCommand(message)
    return
  }

  if (text === '/help') {
    const { handleHelpCommand } = await import('./handlers/on-help-command')
    await handleHelpCommand(message)
    return
  }

  console.info('telegram.webhook.unhandled_message', { chatId: message.chat.id })
}

async function handleCallbackQuery(
  query: NonNullable<TelegramUpdate['callback_query']>,
): Promise<void> {
  const { dispatchCallbackQuery } = await import('./actions/registry')
  await dispatchCallbackQuery(query)
}
