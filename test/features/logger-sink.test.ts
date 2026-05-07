import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  enqueueForSink,
  loggerSinkStats,
  _resetLoggerSinkForTests,
  _flushLoggerSinkForTests,
} from '@/lib/logger-sink'

/**
 * Issue #1220 (epic #1225 — observability pre-launch).
 *
 * External NDJSON sink for the structured logger. The two operational
 * contracts:
 *   1. NEVER block the request path. enqueueForSink returns sync.
 *   2. NEVER throw. A sink failure increments the drop counter and
 *      moves on; the app keeps serving traffic.
 *
 * The sink is vendor-agnostic — anything that accepts NDJSON over
 * POST works (Axiom, Better Stack, Logtail, Loki push API).
 */

const ORIGINAL_URL = process.env.LOGGER_SINK_URL
const ORIGINAL_TOKEN = process.env.LOGGER_SINK_TOKEN
const ORIGINAL_FETCH = globalThis.fetch

beforeEach(() => {
  _resetLoggerSinkForTests()
  delete process.env.LOGGER_SINK_URL
  delete process.env.LOGGER_SINK_TOKEN
})

afterEach(() => {
  _resetLoggerSinkForTests()
  if (ORIGINAL_URL === undefined) delete process.env.LOGGER_SINK_URL
  else process.env.LOGGER_SINK_URL = ORIGINAL_URL
  if (ORIGINAL_TOKEN === undefined) delete process.env.LOGGER_SINK_TOKEN
  else process.env.LOGGER_SINK_TOKEN = ORIGINAL_TOKEN
  globalThis.fetch = ORIGINAL_FETCH
})

test('enqueueForSink is a no-op when LOGGER_SINK_URL is unset', async () => {
  let fetchCalled = false
  globalThis.fetch = (async () => {
    fetchCalled = true
    return new Response(null, { status: 200 })
  }) as typeof fetch

  enqueueForSink('{"level":"info"}')
  await _flushLoggerSinkForTests()

  assert.equal(fetchCalled, false)
  assert.deepEqual(loggerSinkStats(), { drops: 0, shipped: 0, bufferSize: 0 })
})

test('enqueueForSink ships a batch via POST NDJSON when configured', async () => {
  process.env.LOGGER_SINK_URL = 'https://sink.example/ingest'
  process.env.LOGGER_SINK_TOKEN = 'test-bearer-1234567890'

  let captured: { url: string; init: RequestInit } | null = null
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    captured = { url: String(url), init: init ?? {} }
    return new Response(null, { status: 202 })
  }) as typeof fetch

  enqueueForSink('{"level":"info","scope":"a"}')
  enqueueForSink('{"level":"warn","scope":"b"}')
  await _flushLoggerSinkForTests()

  assert.ok(captured, 'fetch was not called')
  const c = captured as { url: string; init: RequestInit }
  assert.equal(c.url, 'https://sink.example/ingest')
  assert.equal(c.init.method, 'POST')
  const headers = c.init.headers as Record<string, string>
  assert.equal(headers['content-type'], 'application/x-ndjson')
  assert.equal(headers.authorization, 'Bearer test-bearer-1234567890')
  assert.equal(
    c.init.body,
    '{"level":"info","scope":"a"}\n{"level":"warn","scope":"b"}',
  )
  assert.equal(loggerSinkStats().shipped, 2)
  assert.equal(loggerSinkStats().drops, 0)
})

test('enqueueForSink works without a token (Loki public push, etc.)', async () => {
  process.env.LOGGER_SINK_URL = 'https://sink.example/ingest'
  let receivedAuth: string | undefined
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    receivedAuth = (init?.headers as Record<string, string>)?.authorization
    return new Response(null, { status: 200 })
  }) as typeof fetch

  enqueueForSink('{"level":"info"}')
  await _flushLoggerSinkForTests()
  assert.equal(receivedAuth, undefined)
  assert.equal(loggerSinkStats().shipped, 1)
})

test('enqueueForSink drops the batch on 5xx (transient sink failure)', async () => {
  process.env.LOGGER_SINK_URL = 'https://sink.example/ingest'
  globalThis.fetch = (async () => new Response(null, { status: 503 })) as typeof fetch

  enqueueForSink('{"level":"info"}')
  enqueueForSink('{"level":"warn"}')
  await _flushLoggerSinkForTests()
  assert.equal(loggerSinkStats().drops, 2)
  assert.equal(loggerSinkStats().shipped, 0)
})

test('enqueueForSink drops the batch on 4xx (config error — replay would fail again)', async () => {
  process.env.LOGGER_SINK_URL = 'https://sink.example/ingest'
  globalThis.fetch = (async () => new Response(null, { status: 401 })) as typeof fetch

  enqueueForSink('{"level":"info"}')
  await _flushLoggerSinkForTests()
  assert.equal(loggerSinkStats().drops, 1)
})

test('enqueueForSink drops the batch on network error (never throws)', async () => {
  process.env.LOGGER_SINK_URL = 'https://sink.example/ingest'
  globalThis.fetch = (async () => {
    throw new Error('ECONNREFUSED')
  }) as typeof fetch

  // The whole point: even a thrown fetch must not propagate.
  enqueueForSink('{"level":"info"}')
  await _flushLoggerSinkForTests()
  assert.equal(loggerSinkStats().drops, 1)
})

test('enqueueForSink returns synchronously (does not block the caller)', () => {
  process.env.LOGGER_SINK_URL = 'https://sink.example/ingest'
  // A 30-second fetch must NOT block enqueueForSink.
  globalThis.fetch = (() =>
    new Promise(() => {
      /* never resolves */
    })) as typeof fetch

  const start = Date.now()
  enqueueForSink('{"level":"info"}')
  // < 50ms is plenty for a sync return + microtask schedule.
  assert.ok(
    Date.now() - start < 50,
    `enqueueForSink took ${Date.now() - start}ms — must be sync`,
  )
})

test('enqueueForSink auto-flushes when batch hits MAX_BATCH (100 lines)', async () => {
  process.env.LOGGER_SINK_URL = 'https://sink.example/ingest'
  let postCount = 0
  let lastBodyLines = 0
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    postCount++
    lastBodyLines = String(init?.body ?? '').split('\n').length
    return new Response(null, { status: 200 })
  }) as typeof fetch

  // Push 100 lines — the 100th should trigger a flush.
  for (let i = 0; i < 100; i++) {
    enqueueForSink(`{"i":${i}}`)
  }
  // Wait a tick for the microtask flush.
  await new Promise(r => setTimeout(r, 50))
  assert.equal(postCount, 1)
  assert.equal(lastBodyLines, 100)
  assert.equal(loggerSinkStats().bufferSize, 0)
})

test('loggerSinkStats reports the running counters for ops introspection', () => {
  const initial = loggerSinkStats()
  assert.deepEqual(initial, { drops: 0, shipped: 0, bufferSize: 0 })
})
