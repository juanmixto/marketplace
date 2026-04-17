import { db } from '@/lib/db'
import type { TelegramMessage } from '../update-schema'
import { sendRawMessage } from '../service'

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

  await sendRawMessage(chatId, {
    text: '👋 Desvinculado. Ya no recibirás avisos aquí.',
  })
  console.info('telegram.link.disconnected', { chatId })
}
