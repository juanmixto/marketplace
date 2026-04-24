/**
 * Typed error taxonomy for Telegram ingestion providers.
 *
 * The worker dispatches on these classes: flood-wait is retryable
 * after a bounded delay, auth-required needs operator action,
 * transport errors retry with backoff, chat-gone disables the chat.
 * Every provider — mock, HTTP, future direct — throws one of these
 * so handler code never has to branch on raw strings.
 */

export abstract class TelegramProviderError extends Error {
  abstract readonly code: string
  /**
   * Worker-level retry hint. `false` means the job should fail the
   * current attempt without retrying; `true` means pg-boss should
   * retry per the configured backoff policy.
   */
  abstract readonly retryable: boolean

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = this.constructor.name
  }
}

/**
 * Transport-level failure reaching the sidecar: timeout, connection
 * refused, 5xx with no structured body. Always retryable.
 */
export class TelegramTransportError extends TelegramProviderError {
  readonly code = 'TRANSPORT'
  readonly retryable = true
  constructor(
    message: string,
    readonly httpStatus: number | null = null,
    options?: { cause?: unknown },
  ) {
    super(message, options)
  }
}

/**
 * Sidecar answered, but the shape did not match the contract.
 * Indicates an SDK / sidecar version drift. Not retryable — the
 * caller should surface it loudly.
 */
export class TelegramBadResponseError extends TelegramProviderError {
  readonly code = 'BAD_RESPONSE'
  readonly retryable = false
}

/**
 * Telethon session expired / 2FA rotation / bot kicked from the
 * account. Needs an operator to re-auth via the admin UI (PR-D).
 * Not retryable by the worker.
 */
export class TelegramAuthRequiredError extends TelegramProviderError {
  readonly code = 'AUTH_REQUIRED'
  readonly retryable = false
  constructor(
    message: string,
    readonly connectionId: string | null = null,
    options?: { cause?: unknown },
  ) {
    super(message, options)
  }
}

/**
 * Telegram rate-limit response (`FLOOD_WAIT_X`). `retryAfterSeconds`
 * is the amount Telegram told us to wait. The worker uses this to
 * reschedule the job instead of retrying immediately.
 */
export class TelegramFloodWaitError extends TelegramProviderError {
  readonly code = 'FLOOD_WAIT'
  readonly retryable = true
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
    options?: { cause?: unknown },
  ) {
    super(message, options)
  }
}

/**
 * Chat was deleted, archived, or the ingestion account was removed.
 * Not retryable — the worker disables the chat and logs a loud event.
 */
export class TelegramChatGoneError extends TelegramProviderError {
  readonly code = 'CHAT_GONE'
  readonly retryable = false
  constructor(
    message: string,
    readonly tgChatId: string | null = null,
    options?: { cause?: unknown },
  ) {
    super(message, options)
  }
}
