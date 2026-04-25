import test from 'node:test'
import assert from 'node:assert/strict'
import { retryWithBackoff } from '@/lib/retry-with-backoff'
import { FetchTimeoutError } from '@/lib/fetch-with-timeout'

test('resolves on first attempt without retrying', async () => {
  let calls = 0
  const result = await retryWithBackoff(async () => {
    calls++
    return 'ok'
  })
  assert.equal(result, 'ok')
  assert.equal(calls, 1)
})

test('retries on retryable network error and eventually succeeds', async () => {
  let calls = 0
  const result = await retryWithBackoff(
    async () => {
      calls++
      if (calls < 3) throw new Error('network unreachable')
      return 'ok'
    },
    { baseDelayMs: 1, maxDelayMs: 5 },
  )
  assert.equal(result, 'ok')
  assert.equal(calls, 3)
})

test('does NOT retry on non-retryable error (e.g. validation)', async () => {
  let calls = 0
  await assert.rejects(
    () =>
      retryWithBackoff(
        async () => {
          calls++
          throw new Error('Invalid input: email required')
        },
        { baseDelayMs: 1 },
      ),
    /Invalid input/,
  )
  assert.equal(calls, 1)
})

test('throws last error after exhausting retries', async () => {
  let calls = 0
  await assert.rejects(
    () =>
      retryWithBackoff(
        async () => {
          calls++
          throw new Error('fetch failed: ECONNRESET')
        },
        { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2 },
      ),
    /ECONNRESET/,
  )
  // 1 initial attempt + 2 retries = 3 total
  assert.equal(calls, 3)
})

test('FetchTimeoutError is treated as retryable', async () => {
  let calls = 0
  const result = await retryWithBackoff(
    async () => {
      calls++
      if (calls === 1) throw new FetchTimeoutError('https://example.test', 100)
      return 'ok'
    },
    { baseDelayMs: 1 },
  )
  assert.equal(result, 'ok')
  assert.equal(calls, 2)
})

test('onRetry callback fires on each retry with attempt number and delay', async () => {
  const events: Array<{ attempt: number; delayMs: number }> = []
  await retryWithBackoff(
    async () => {
      throw new Error('network error')
    },
    {
      maxRetries: 2,
      baseDelayMs: 1,
      maxDelayMs: 5,
      onRetry: (_err, attempt, delayMs) => events.push({ attempt, delayMs }),
    },
  ).catch(() => {})
  assert.equal(events.length, 2)
  assert.equal(events[0]!.attempt, 1)
  assert.equal(events[1]!.attempt, 2)
  assert.ok(events[0]!.delayMs > 0)
})

test('custom shouldRetry overrides default behavior', async () => {
  let calls = 0
  const result = await retryWithBackoff(
    async () => {
      calls++
      if (calls < 2) {
        const err = new Error('Validation failed') as Error & { status?: number }
        err.status = 503
        throw err
      }
      return 'ok'
    },
    {
      baseDelayMs: 1,
      shouldRetry: (err) => (err as { status?: number }).status === 503,
    },
  )
  assert.equal(result, 'ok')
  assert.equal(calls, 2)
})

test('respects maxDelayMs cap on exponential backoff', async () => {
  const delays: number[] = []
  await retryWithBackoff(
    async () => {
      throw new Error('network')
    },
    {
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 50,
      onRetry: (_err, _attempt, delayMs) => delays.push(delayMs),
    },
  ).catch(() => {})
  // Every delay must be capped at maxDelayMs even though
  // exponential growth would exceed it (1000 * 2^n).
  for (const d of delays) assert.ok(d <= 50, `delay ${d} exceeded cap 50`)
})
