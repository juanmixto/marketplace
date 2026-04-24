import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createTelethonHttpProvider,
  TelegramAuthRequiredError,
  TelegramBadResponseError,
  TelegramChatGoneError,
  TelegramFloodWaitError,
  TelegramTransportError,
} from '@/domains/ingestion'

interface FakeFetchCall {
  url: string
  init: RequestInit | undefined
}

function fakeFetch(
  responder: (call: FakeFetchCall) => Response | Promise<Response>,
): { fetch: typeof fetch; calls: FakeFetchCall[] } {
  const calls: FakeFetchCall[] = []
  const fn: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url
    calls.push({ url, init })
    return responder({ url, init })
  }
  return { fetch: fn, calls }
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

const BASE = 'http://sidecar.test'
const SECRET = 'test-secret'

test('http.fetchMessages sends shared-secret header and parses body', async () => {
  const { fetch, calls } = fakeFetch(() =>
    jsonResponse(200, { messages: [], nextFromMessageId: null }),
  )
  const provider = createTelethonHttpProvider({
    baseUrl: BASE,
    sharedSecret: SECRET,
    timeoutMs: 500,
    fetchImpl: fetch,
  })
  const result = await provider.fetchMessages({
    connectionId: 'c1',
    tgChatId: '-100',
    fromMessageId: null,
    limit: 10,
  })
  assert.deepEqual(result, { messages: [], nextFromMessageId: null })
  assert.equal(calls.length, 1)
  const headers = calls[0]!.init!.headers as Record<string, string>
  assert.equal(headers['X-Sidecar-Token'], SECRET)
  assert.equal(headers['Content-Type'], 'application/json')
})

test('http.fetchMessages retries on 5xx then succeeds', async () => {
  let n = 0
  const { fetch, calls } = fakeFetch(() => {
    n++
    if (n < 3) return new Response('boom', { status: 502 })
    return jsonResponse(200, { messages: [], nextFromMessageId: null })
  })
  const provider = createTelethonHttpProvider({
    baseUrl: BASE,
    sharedSecret: SECRET,
    timeoutMs: 500,
    maxAttempts: 3,
    fetchImpl: fetch,
  })
  const result = await provider.fetchMessages({
    connectionId: 'c1',
    tgChatId: '-100',
    fromMessageId: null,
    limit: 10,
  })
  assert.deepEqual(result.messages, [])
  assert.equal(calls.length, 3)
})

test('http.fetchMessages surfaces TelegramTransportError after exhausting retries', async () => {
  const { fetch, calls } = fakeFetch(
    () => new Response('boom', { status: 503 }),
  )
  const provider = createTelethonHttpProvider({
    baseUrl: BASE,
    sharedSecret: SECRET,
    timeoutMs: 500,
    maxAttempts: 2,
    fetchImpl: fetch,
  })
  await assert.rejects(
    provider.fetchMessages({
      connectionId: 'c1',
      tgChatId: '-100',
      fromMessageId: null,
      limit: 10,
    }),
    (err: unknown) => err instanceof TelegramTransportError && err.retryable === true,
  )
  assert.equal(calls.length, 2)
})

test('http.fetchMessages maps 401 → TelegramAuthRequiredError (no retry)', async () => {
  const { fetch, calls } = fakeFetch(() =>
    jsonResponse(401, { error: 'session expired', connection_id: 'c1' }),
  )
  const provider = createTelethonHttpProvider({
    baseUrl: BASE,
    sharedSecret: SECRET,
    timeoutMs: 500,
    maxAttempts: 3,
    fetchImpl: fetch,
  })
  await assert.rejects(
    provider.fetchMessages({
      connectionId: 'c1',
      tgChatId: '-100',
      fromMessageId: null,
      limit: 10,
    }),
    (err: unknown) =>
      err instanceof TelegramAuthRequiredError && err.connectionId === 'c1',
  )
  // Crucial: auth errors must not retry.
  assert.equal(calls.length, 1)
})

test('http.fetchMessages maps 429 → TelegramFloodWaitError with retry-after', async () => {
  const { fetch } = fakeFetch(() =>
    jsonResponse(429, { error: 'FLOOD_WAIT_60', retry_after_seconds: 60 }),
  )
  const provider = createTelethonHttpProvider({
    baseUrl: BASE,
    sharedSecret: SECRET,
    timeoutMs: 500,
    maxAttempts: 3,
    fetchImpl: fetch,
  })
  await assert.rejects(
    provider.fetchMessages({
      connectionId: 'c1',
      tgChatId: '-100',
      fromMessageId: null,
      limit: 10,
    }),
    (err: unknown) =>
      err instanceof TelegramFloodWaitError && err.retryAfterSeconds === 60,
  )
})

test('http.fetchMessages maps 404 → TelegramChatGoneError', async () => {
  const { fetch } = fakeFetch(() =>
    jsonResponse(404, { error: 'chat removed', tg_chat_id: '-100' }),
  )
  const provider = createTelethonHttpProvider({
    baseUrl: BASE,
    sharedSecret: SECRET,
    timeoutMs: 500,
    fetchImpl: fetch,
  })
  await assert.rejects(
    provider.fetchMessages({
      connectionId: 'c1',
      tgChatId: '-100',
      fromMessageId: null,
      limit: 10,
    }),
    TelegramChatGoneError,
  )
})

test('http.fetchMessages maps malformed body → TelegramBadResponseError (no retry)', async () => {
  const { fetch, calls } = fakeFetch(() => jsonResponse(200, { nope: 'wrong' }))
  const provider = createTelethonHttpProvider({
    baseUrl: BASE,
    sharedSecret: SECRET,
    timeoutMs: 500,
    maxAttempts: 3,
    fetchImpl: fetch,
  })
  await assert.rejects(
    provider.fetchMessages({
      connectionId: 'c1',
      tgChatId: '-100',
      fromMessageId: null,
      limit: 10,
    }),
    TelegramBadResponseError,
  )
  assert.equal(calls.length, 1)
})

test('http.fetchMedia streams chunks from the response body', async () => {
  const { fetch } = fakeFetch(
    () =>
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg', 'content-length': '4' },
      }),
  )
  const provider = createTelethonHttpProvider({
    baseUrl: BASE,
    sharedSecret: SECRET,
    timeoutMs: 500,
    fetchImpl: fetch,
  })
  const { stream, sizeBytes, mimeType } = await provider.fetchMedia({
    connectionId: 'c1',
    fileUniqueId: 'abc',
  })
  assert.equal(sizeBytes, 4)
  assert.equal(mimeType, 'image/jpeg')
  const bytes: number[] = []
  for await (const chunk of stream) bytes.push(...chunk)
  assert.deepEqual(bytes, [1, 2, 3, 4])
})

test('http.fetchMedia maps 404 → TelegramChatGoneError', async () => {
  const { fetch } = fakeFetch(() => new Response('gone', { status: 404 }))
  const provider = createTelethonHttpProvider({
    baseUrl: BASE,
    sharedSecret: SECRET,
    timeoutMs: 500,
    fetchImpl: fetch,
  })
  await assert.rejects(
    provider.fetchMedia({ connectionId: 'c1', fileUniqueId: 'abc' }),
    TelegramChatGoneError,
  )
})

test('http request URL honours baseUrl without trailing slash', async () => {
  const { fetch, calls } = fakeFetch(() =>
    jsonResponse(200, { messages: [], nextFromMessageId: null }),
  )
  const provider = createTelethonHttpProvider({
    baseUrl: 'http://sidecar.test/', // trailing slash
    sharedSecret: SECRET,
    timeoutMs: 500,
    fetchImpl: fetch,
  })
  await provider.fetchMessages({
    connectionId: 'c1',
    tgChatId: '-100',
    fromMessageId: null,
    limit: 10,
  })
  // No double slash between base and path.
  assert.equal(calls[0]!.url, 'http://sidecar.test/messages')
})
