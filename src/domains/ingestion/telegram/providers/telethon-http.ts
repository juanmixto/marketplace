import { logger } from '@/lib/logger'
import {
  TelegramAuthRequiredError,
  TelegramBadResponseError,
  TelegramChatGoneError,
  TelegramFloodWaitError,
  TelegramProviderError,
  TelegramTransportError,
} from './errors'
import type {
  FetchChatsInput,
  FetchChatsResult,
  FetchMediaInput,
  FetchMediaResult,
  FetchMessagesInput,
  FetchMessagesResult,
  FetchTopicsInput,
  FetchTopicsResult,
  TelegramIngestionProvider,
} from './types'

/**
 * HTTP bridge to the Python Telethon sidecar.
 *
 * Deployment invariant: this client must only be reachable by the
 * worker process, and the sidecar itself must only bind to a
 * private network / loopback. See services/telegram-sidecar/README.md
 * and docs/ingestion/telegram.md § "How to verify zero runtime
 * impact" for the contract operators commit to.
 *
 * Behaviour:
 *
 *   - `AbortController` per request with a configurable timeout.
 *   - Exponential retry (x3) on TelegramTransportError only.
 *     Flood-wait, auth-required, chat-gone, and bad-response never
 *     retry here — they bubble to the worker, which handles them
 *     with different strategies (reschedule, disable, alert).
 *   - Shared-secret auth via `X-Sidecar-Token`.
 *   - Structured logs on every request (`ingestion.telegram.http.*`)
 *     with a correlation id so oncall can trace one sync run end to
 *     end even when the sidecar is a separate process.
 */

const LOG_SCOPE = 'ingestion.telegram.http'
const USER_AGENT = 'marketplace-ingestion/1.0'

export interface TelethonHttpProviderConfig {
  baseUrl: string
  sharedSecret: string
  timeoutMs: number
  maxAttempts?: number
  /** Custom fetch, primarily for tests. */
  fetchImpl?: typeof fetch
}

export function createTelethonHttpProvider(
  config: TelethonHttpProviderConfig,
): TelegramIngestionProvider {
  const maxAttempts = config.maxAttempts ?? 3
  const fetchImpl = config.fetchImpl ?? fetch

  async function request<T>(
    path: string,
    init: RequestInit,
    correlationId: string,
  ): Promise<T> {
    const url = `${config.baseUrl.replace(/\/$/, '')}${path}`
    let lastErr: unknown = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), config.timeoutMs)
      try {
        logger.info(`${LOG_SCOPE}.request`, {
          path,
          attempt,
          correlationId,
        })
        const res = await fetchImpl(url, {
          ...init,
          signal: controller.signal,
          headers: {
            'X-Sidecar-Token': config.sharedSecret,
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
            ...(init.headers ?? {}),
          },
        })
        clearTimeout(timer)

        if (res.status >= 500) {
          throw new TelegramTransportError(
            `sidecar ${path} responded ${res.status}`,
            res.status,
          )
        }

        if (!res.ok) {
          await throwStructuredError(res, path)
        }

        const body = (await res.json()) as T
        logger.info(`${LOG_SCOPE}.response`, {
          path,
          status: res.status,
          attempt,
          correlationId,
        })
        return body
      } catch (err) {
        clearTimeout(timer)
        lastErr = err

        // Non-retryable: stop immediately.
        if (err instanceof TelegramProviderError && !err.retryable) {
          throw err
        }

        // Treat AbortError as a transport error so retry policy applies.
        if (isAbortError(err)) {
          lastErr = new TelegramTransportError(
            `sidecar ${path} timed out after ${config.timeoutMs}ms`,
            null,
            { cause: err },
          )
        }

        // Network-level fetch failures.
        if (!(lastErr instanceof TelegramProviderError)) {
          lastErr = new TelegramTransportError(
            `sidecar ${path} transport error`,
            null,
            { cause: err },
          )
        }

        if (attempt < maxAttempts) {
          const backoffMs = 200 * 2 ** (attempt - 1)
          logger.warn(`${LOG_SCOPE}.retry`, {
            path,
            attempt,
            backoffMs,
            error: lastErr,
            correlationId,
          })
          await sleep(backoffMs)
          continue
        }
      }
    }

    logger.error(`${LOG_SCOPE}.failed`, {
      path,
      correlationId,
      error: lastErr,
    })
    // lastErr is always a TelegramProviderError at this point per the
    // normalization above, but TS can't prove it.
    throw lastErr as TelegramProviderError
  }

  function correlation(input: { correlationId?: string }): string {
    return input.correlationId ?? cryptoRandomId()
  }

  return {
    code: 'telethon',

    async fetchChats(input: FetchChatsInput): Promise<FetchChatsResult> {
      const cid = correlation(input as { correlationId?: string })
      const body = await request<{ chats: FetchChatsResult['chats'] }>(
        '/chats',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connection_id: input.connectionId,
            limit: input.limit ?? null,
          }),
        },
        cid,
      )
      if (!body || !Array.isArray(body.chats)) {
        throw new TelegramBadResponseError('sidecar /chats returned malformed body')
      }
      return { chats: body.chats }
    },

    async fetchMessages(input: FetchMessagesInput): Promise<FetchMessagesResult> {
      const cid = correlation(input as { correlationId?: string })
      const body = await request<FetchMessagesResult>(
        '/messages',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connection_id: input.connectionId,
            tg_chat_id: input.tgChatId,
            from_message_id: input.fromMessageId,
            limit: input.limit,
          }),
        },
        cid,
      )
      if (!body || !Array.isArray(body.messages)) {
        throw new TelegramBadResponseError('sidecar /messages returned malformed body')
      }
      return {
        messages: body.messages,
        nextFromMessageId: body.nextFromMessageId ?? null,
      }
    },

    async fetchMedia(input: FetchMediaInput): Promise<FetchMediaResult> {
      const cid = correlation(input as { correlationId?: string })
      const url = `${config.baseUrl.replace(/\/$/, '')}/media/${encodeURIComponent(input.fileUniqueId)}`
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), config.timeoutMs)
      let res: Response
      try {
        res = await fetchImpl(url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'X-Sidecar-Token': config.sharedSecret,
            'User-Agent': USER_AGENT,
          },
        })
      } catch (err) {
        clearTimeout(timer)
        if (isAbortError(err)) {
          throw new TelegramTransportError(
            `sidecar /media timed out after ${config.timeoutMs}ms`,
            null,
            { cause: err },
          )
        }
        throw new TelegramTransportError(
          `sidecar /media transport error`,
          null,
          { cause: err },
        )
      }
      // NOTE: the timer is intentionally left running; aborting the
      // controller aborts the body stream too, which is desirable if
      // the sidecar stops sending chunks partway through. The caller
      // is expected to consume the stream promptly.

      if (res.status === 404) {
        throw new TelegramChatGoneError('sidecar: media gone (404)')
      }
      if (res.status === 401 || res.status === 403) {
        throw new TelegramAuthRequiredError('sidecar: unauthorized')
      }
      if (!res.ok) {
        throw new TelegramTransportError(
          `sidecar /media responded ${res.status}`,
          res.status,
        )
      }
      if (!res.body) {
        throw new TelegramBadResponseError('sidecar /media returned no body')
      }
      logger.info(`${LOG_SCOPE}.response`, {
        path: '/media',
        status: res.status,
        correlationId: cid,
      })
      return {
        stream: iterateResponseBody(res),
        mimeType: res.headers.get('content-type'),
        sizeBytes: parseContentLength(res.headers.get('content-length')),
      }
    },

    async fetchTopics(input: FetchTopicsInput): Promise<FetchTopicsResult> {
      const cid = correlation(input as { correlationId?: string })
      const body = await request<FetchTopicsResult>(
        '/topics',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connection_id: input.connectionId,
            tg_chat_id: input.tgChatId,
          }),
        },
        cid,
      )
      if (!body || !Array.isArray(body.topics)) {
        throw new TelegramBadResponseError('sidecar /topics returned malformed body')
      }
      return { topics: body.topics }
    },
  }
}

async function throwStructuredError(res: Response, path: string): Promise<never> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // ignore; fall through to generic error below
  }
  const payload = (body ?? {}) as {
    error?: string
    retry_after_seconds?: number
    connection_id?: string
    tg_chat_id?: string
  }

  if (res.status === 401 || res.status === 403) {
    throw new TelegramAuthRequiredError(
      payload.error ?? `sidecar ${path} unauthorized`,
      payload.connection_id ?? null,
    )
  }
  if (res.status === 429 && typeof payload.retry_after_seconds === 'number') {
    throw new TelegramFloodWaitError(
      payload.error ?? `sidecar ${path} rate-limited`,
      payload.retry_after_seconds,
    )
  }
  if (res.status === 404) {
    throw new TelegramChatGoneError(
      payload.error ?? `sidecar ${path} target gone`,
      payload.tg_chat_id ?? null,
    )
  }
  throw new TelegramBadResponseError(
    payload.error ?? `sidecar ${path} responded ${res.status}`,
  )
}

async function* iterateResponseBody(res: Response): AsyncIterable<Uint8Array> {
  // `Response.body` is a WHATWG ReadableStream; reader pull loop.
  const reader = res.body!.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      if (value) yield value
    }
  } finally {
    reader.releaseLock()
  }
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' || /aborted/i.test(err.message))
  )
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cryptoRandomId(): string {
  // Only needed for correlation fallbacks; not security-sensitive.
  // Math.random is plenty for a log-grouping id.
  return `cid_${Math.random().toString(36).slice(2, 10)}`
}
