import { db } from '@/lib/db'
import type { TelegramMessage } from '../update-schema'
import { consumeLinkToken } from '../link-token'
import { sendRawMessage } from '../service'

function appLink(path: string): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  if (!base) return null
  return `${base}${path}`
}

export async function handleStartCommand(message: TelegramMessage): Promise<void> {
  const chatId = String(message.chat.id)
  const text = message.text?.trim() ?? ''
  const parts = text.split(/\s+/)
  const token = parts[1]

  if (!token) {
    const settingsUrl = appLink('/vendor/ajustes/telegram')
    const notificationsUrl = appLink('/vendor/ajustes/notificaciones')
    const row = [
      ...(settingsUrl ? [{ text: 'Abrir ajustes', url: settingsUrl }] : []),
      ...(notificationsUrl ? [{ text: 'Ver notificaciones', url: notificationsUrl }] : []),
    ]
    await sendRawMessage(chatId, {
      text: [
        '👋 Bienvenido.',
        '',
        'Para vincular tu cuenta, abre Ajustes → Telegram en la plataforma, genera un enlace y vuelve a enviar /start con el token.',
        '',
        'Si quieres revisar el estado o deshacer la vinculación más tarde, usa /status o /disconnect desde este chat.',
      ].join('\n'),
      ...(row.length > 0 ? { inline_keyboard: [row] } : {}),
    })
    console.info('telegram.link.start_without_token', { chatId })
    return
  }

  const consumed = await consumeLinkToken(token)
  if (!consumed) {
    await sendRawMessage(chatId, {
      text: '❌ Token inválido o caducado. Genera uno nuevo en Ajustes → Telegram.',
    })
    console.info('telegram.link.invalid_token', { chatId })
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
    ...((): { inline_keyboard?: Array<Array<{ text: string; url: string }>> } => {
      const notificationsUrl = appLink('/vendor/ajustes/notificaciones')
      const statusUrl = appLink('/vendor/ajustes/telegram')
      const row = [
        ...(notificationsUrl ? [{ text: 'Ver notificaciones', url: notificationsUrl }] : []),
        ...(statusUrl ? [{ text: 'Ver estado', url: statusUrl }] : []),
      ]
      return row.length > 0 ? { inline_keyboard: [row] } : {}
    })(),
  })
  console.info('telegram.link.linked', { userId: consumed.userId, chatId })
}
