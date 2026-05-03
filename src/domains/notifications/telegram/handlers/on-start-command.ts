import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { TelegramMessage } from '../update-schema'
import { consumeLinkToken } from '../link-token'
import { sendRawMessage } from '../service'

export async function handleStartCommand(message: TelegramMessage): Promise<void> {
  const chatId = String(message.chat.id)
  const text = message.text?.trim() ?? ''
  const parts = text.split(/\s+/)
  const token = parts[1]

  if (!token) {
    await sendRawMessage(chatId, {
      text:
        '👋 Bienvenido. Para vincular tu cuenta, genera un enlace desde Ajustes → Telegram en la plataforma.',
    })
    logger.info('telegram.link.start_without_token', { chatId })
    return
  }

  const consumed = await consumeLinkToken(token)
  if (!consumed) {
    await sendRawMessage(chatId, {
      text: '❌ Token inválido o caducado. Genera uno nuevo en Ajustes → Telegram.',
    })
    logger.info('telegram.link.invalid_token', { chatId })
    return
  }

  await db.telegramLink.updateMany({
    where: { chatId, userId: { not: consumed.userId } },
    data: { isActive: false },
  })

  const username = message.from?.username ?? null
  await db.telegramLink.upsert({
    where: { userId: consumed.userId },
    create: {
      userId: consumed.userId,
      chatId,
      username,
      isActive: true,
      lastSeenAt: new Date(),
    },
    update: {
      chatId,
      username,
      isActive: true,
      lastSeenAt: new Date(),
    },
  })

  await sendRawMessage(chatId, {
    text: '✅ Conectado. Recibirás avisos de pedidos aquí.',
  })
  logger.info('telegram.link.linked', { userId: consumed.userId, chatId })
}
