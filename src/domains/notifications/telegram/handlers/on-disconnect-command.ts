import { db } from '@/lib/db'
import type { TelegramMessage } from '../update-schema'
import { sendRawMessage } from '../service'

function appLink(path: string): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  if (!base) return null
  return `${base}${path}`
}

export async function handleDisconnectCommand(message: TelegramMessage): Promise<void> {
  const chatId = String(message.chat.id)
  const result = await db.telegramLink.updateMany({
    where: { chatId, isActive: true },
    data: { isActive: false },
  })

  if (result.count === 0) {
    await sendRawMessage(chatId, {
      text: 'No había ninguna cuenta vinculada a este chat.',
    })
    return
  }

  const reconnectUrl = appLink('/vendor/ajustes/telegram')
  await sendRawMessage(chatId, {
    text: '👋 Desvinculado. Ya no recibirás avisos aquí.',
    ...(reconnectUrl
      ? {
          inline_keyboard: [[{ text: 'Volver a vincular', url: reconnectUrl }]],
        }
      : {}),
  })
  console.info('telegram.link.disconnected', { chatId })
}
