// Retry with exponential backoff + jitter. Use ONLY for idempotent
// operations — see the JSDoc on retryWithBackoff for the safety contract.
//
// On a degraded mobile network, transient failures (DNS jitter, 5xx during
// a deploy, TCP reset) are common. A single automatic retry eliminates a
// large fraction of user-visible errors. But retrying a non-idempotent
// mutation can duplicate writes — that is what `checkoutAttemptId` /
// idempotency tokens are for (#788). If you don't have an idempotency
// token, your operation is NOT a candidate for this helper.

import { FetchTimeoutError } from './fetch-with-timeout'

export interface RetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  shouldRetry?: (err: unknown, attempt: number) => boolean
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void
}

const DEFAULTS = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 2_000,
} as const

const RETRYABLE_PATTERNS = [
  'network',
  'timeout',
  'econnreset',
  'etimedout',
  'enotfound',
  'fetch failed',
  'socket hang up',
] as const

const isRetryableNetworkError = (err: unknown): boolean => {
  if (err instanceof FetchTimeoutError) return true
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return RETRYABLE_PATTERNS.some((p) => msg.includes(p))
}

/**
 * Retry an idempotent async operation with exponential backoff + jitter.
 *
 * IDEMPOTENCY CONTRACT: this helper assumes `fn` is safe to call more than
 * once with the same observable effect. Use it for:
 *   - Reads (queries, GET)
 *   - Set/unset toggles (favorite, follow)
 *   - Operations protected by a server-side idempotency key
 *
 * Do NOT use it for:
 *   - createOrder / checkout (use `checkoutAttemptId` — see docs/checkout-dedupe.md)
 *   - addToCart with increment (would duplicate items)
 *   - Any mutation that creates resources without an idempotency token
 *
 * Defaults: 3 retries, 100ms base, 2s cap. Network/timeout errors retried;
 * everything else (4xx, validation errors) is thrown immediately.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? DEFAULTS.maxRetries
  const baseDelayMs = opts.baseDelayMs ?? DEFAULTS.baseDelayMs
  const maxDelayMs = opts.maxDelayMs ?? DEFAULTS.maxDelayMs
  const shouldRetry = opts.shouldRetry ?? ((err) => isRetryableNetworkError(err))

  let lastErr: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === maxRetries || !shouldRetry(err, attempt)) throw err

      const exponential = baseDelayMs * 2 ** attempt
      const jitter = Math.random() * baseDelayMs
      const delayMs = Math.min(exponential + jitter, maxDelayMs)

      opts.onRetry?.(err, attempt + 1, delayMs)
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}
