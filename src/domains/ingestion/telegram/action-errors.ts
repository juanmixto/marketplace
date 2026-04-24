/**
 * Typed errors thrown by the Telegram admin server actions.
 *
 * Lives in its own non-`'use server'` module because Next.js
 * server-action files can only export async functions — a class
 * export breaks the Turbopack build. Same constraint that forced
 * the ingestion publish + vendor claim errors into sibling modules.
 *
 * The `reason` tag is machine-readable so the client UI can branch
 * (e.g. show the "enter 2FA password" form when `passwordRequired`)
 * without scraping the human message.
 */
export class TelegramActionError extends Error {
  readonly reason: string
  constructor(reason: string, message: string) {
    super(message)
    this.name = 'TelegramActionError'
    this.reason = reason
  }
}
