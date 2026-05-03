import { logger } from '@/lib/logger'

export type TelegramConfig = {
  token: string
  webhookSecret: string
  botUsername: string
}

export function getTelegramConfig(): TelegramConfig | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.trim()

  if (!token || !webhookSecret || !botUsername) {
    const missing: string[] = []
    if (!token) missing.push('TELEGRAM_BOT_TOKEN')
    if (!webhookSecret) missing.push('TELEGRAM_WEBHOOK_SECRET')
    if (!botUsername) missing.push('TELEGRAM_BOT_USERNAME')
    // Boot-time config gap. Fail-open is intentional (telegram is optional in
    // dev / preview environments); we just need oncall visibility when it is
    // missing in a place that expected it. Emitted on every call — cheap, and
    // dedup is left to the log aggregator rather than adding state here.
    logger.warn('notifications.config.missing', {
      subsystem: 'telegram',
      missing,
    })
    return null
  }
  return { token, webhookSecret, botUsername }
}

export function isTelegramEnabled(): boolean {
  return getTelegramConfig() !== null
}
