export type TelegramConfig = {
  token: string
  webhookSecret: string
  botUsername: string
}

export function getTelegramConfig(): TelegramConfig | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.trim()

  if (!token || !webhookSecret || !botUsername) return null
  return { token, webhookSecret, botUsername }
}

export function isTelegramEnabled(): boolean {
  return getTelegramConfig() !== null
}
