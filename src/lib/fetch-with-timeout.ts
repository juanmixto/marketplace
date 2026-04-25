// fetch() in JavaScript has no default timeout — a stalled connection on a
// degraded mobile network can hang indefinitely. Wrap fetch with an
// AbortController that aborts after `timeoutMs` and surface the timeout
// as a typed error so callers (and Sentry breadcrumbs / error mappers)
// can distinguish it from a generic network failure.

export class FetchTimeoutError extends Error {
  readonly url: string
  readonly timeoutMs: number

  constructor(url: string, timeoutMs: number) {
    super(`Fetch timed out after ${timeoutMs}ms: ${url}`)
    this.name = 'FetchTimeoutError'
    this.url = url
    this.timeoutMs = timeoutMs
  }
}

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 8_000

export async function fetchWithTimeout(
  input: string | URL | Request,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal, ...init } = options

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  // Compose with an externally-provided signal so callers can still cancel
  // (e.g. React strict-mode unmount, route abort). If the external signal
  // is already aborted at call time, mirror that immediately.
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (err) {
    // The AbortError shape is the same regardless of who aborted; we
    // distinguish "we timed out" from "caller cancelled" by checking
    // whether the external signal was the cause.
    const isAbort = err instanceof Error && err.name === 'AbortError'
    if (isAbort && !externalSignal?.aborted) {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      throw new FetchTimeoutError(url, timeoutMs)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}
