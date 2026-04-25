import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchWithTimeout, FetchTimeoutError } from '@/lib/fetch-with-timeout'

const originalFetch = globalThis.fetch

function withMockFetch(impl: typeof fetch, fn: () => Promise<void>) {
  return async () => {
    globalThis.fetch = impl as typeof fetch
    try {
      await fn()
    } finally {
      globalThis.fetch = originalFetch
    }
  }
}

test(
  'resolves normally when fetch responds before timeout',
  withMockFetch(
    async () => new Response('ok', { status: 200 }),
    async () => {
      const res = await fetchWithTimeout('https://example.test/x', { timeoutMs: 1000 })
      assert.equal(res.status, 200)
      assert.equal(await res.text(), 'ok')
    },
  ),
)

test(
  'throws FetchTimeoutError when timeout fires before response',
  withMockFetch(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        // Respect the AbortSignal that fetchWithTimeout passes us.
        const signal = (init as RequestInit)?.signal as AbortSignal | undefined
        signal?.addEventListener('abort', () => {
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        })
      }),
    async () => {
      await assert.rejects(
        () => fetchWithTimeout('https://example.test/slow', { timeoutMs: 25 }),
        (err: unknown) => {
          assert.ok(err instanceof FetchTimeoutError, 'expected FetchTimeoutError')
          assert.equal((err as FetchTimeoutError).timeoutMs, 25)
          assert.match((err as FetchTimeoutError).url, /slow/)
          return true
        },
      )
    },
  ),
)

test(
  'composes external signal: caller cancellation propagates without becoming a timeout error',
  withMockFetch(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = (init as RequestInit)?.signal as AbortSignal | undefined
        signal?.addEventListener('abort', () => {
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        })
      }),
    async () => {
      const externalController = new AbortController()
      const promise = fetchWithTimeout('https://example.test/x', {
        timeoutMs: 5_000,
        signal: externalController.signal,
      })
      externalController.abort()
      await assert.rejects(promise, (err: unknown) => {
        assert.ok(err instanceof Error)
        // Caller-driven aborts surface as the original AbortError, NOT as
        // FetchTimeoutError — the distinction matters for retry policy.
        assert.equal((err as Error).name, 'AbortError')
        assert.ok(!(err instanceof FetchTimeoutError))
        return true
      })
    },
  ),
)

test(
  'pre-aborted external signal aborts the fetch immediately',
  withMockFetch(
    (_url, init) => {
      const signal = (init as RequestInit)?.signal as AbortSignal | undefined
      // The composed controller should already be aborted by the time
      // fetch is called, so reject synchronously like a real fetch would.
      if (signal?.aborted) {
        const err = new Error('aborted')
        err.name = 'AbortError'
        return Promise.reject(err)
      }
      return Promise.resolve(new Response('ok'))
    },
    async () => {
      const externalController = new AbortController()
      externalController.abort()
      await assert.rejects(
        () =>
          fetchWithTimeout('https://example.test/x', {
            timeoutMs: 5_000,
            signal: externalController.signal,
          }),
        (err: unknown) => (err as Error).name === 'AbortError',
      )
    },
  ),
)
