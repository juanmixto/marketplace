import { getTelegramConfig } from './config'

export class TelegramApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly errorCode: number | null,
    public readonly description: string,
  ) {
    super(`Telegram API ${method} failed: ${description}`)
    this.name = 'TelegramApiError'
  }
}

type BotApiResponse<T> =
  | { ok: true; result: T }
  | { ok: false; error_code: number; description: string }

const DEFAULT_TIMEOUT_MS = 5_000

export async function callBotApi<T>(
  method: string,
  body: Record<string, unknown>,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const config = getTelegramConfig()
  if (!config) {
    throw new TelegramApiError(method, null, 'Telegram integration disabled (missing env)')
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const payload = (await res.json()) as BotApiResponse<T>
    if (!payload.ok) {
      throw new TelegramApiError(method, payload.error_code, payload.description)
    }
    return payload.result
  } catch (err) {
    if (err instanceof TelegramApiError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TelegramApiError(method, null, `timeout after ${timeoutMs}ms`)
    }
    const message = err instanceof Error ? err.message : String(err)
    throw new TelegramApiError(method, null, `network error: ${message}`)
  } finally {
    clearTimeout(timer)
  }
}
