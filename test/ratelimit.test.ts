import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'

test('checkRateLimit allows requests under limit and tracks remaining', async () => {
  const result1 = await checkRateLimit('rl-test-1', '10.0.0.1', 3, 60)
  assert.equal(result1.success, true)
  assert.equal(result1.remaining, 2)

  const result2 = await checkRateLimit('rl-test-1', '10.0.0.1', 3, 60)
  assert.equal(result2.success, true)
  assert.equal(result2.remaining, 1)
})

test('checkRateLimit rejects requests over limit', async () => {
  await checkRateLimit('rl-test-2', '10.0.0.2', 3, 60)
  await checkRateLimit('rl-test-2', '10.0.0.2', 3, 60)
  await checkRateLimit('rl-test-2', '10.0.0.2', 3, 60)

  const result = await checkRateLimit('rl-test-2', '10.0.0.2', 3, 60)
  assert.equal(result.success, false)
  assert.equal(result.remaining, 0)
  assert.match(result.message ?? '', /demasiados intentos/i)
})

test('checkRateLimit maintains independent counters per IP', async () => {
  const r1 = await checkRateLimit('rl-test-3', '10.0.0.3', 2, 60)
  const r2 = await checkRateLimit('rl-test-3', '10.0.0.4', 2, 60)
  assert.equal(r1.success, true)
  assert.equal(r2.success, true)

  const r3 = await checkRateLimit('rl-test-3', '10.0.0.3', 2, 60)
  const r4 = await checkRateLimit('rl-test-3', '10.0.0.4', 2, 60)
  assert.equal(r3.remaining, 0)
  assert.equal(r4.remaining, 0)
})

test('checkRateLimit maintains independent counters per action', async () => {
  await checkRateLimit('register', '10.0.0.5', 1, 60)
  await checkRateLimit('login', '10.0.0.5', 1, 60)

  const registerResult = await checkRateLimit('register', '10.0.0.5', 1, 60)
  assert.equal(registerResult.success, false)

  const loginResult = await checkRateLimit('login', '10.0.0.5', 1, 60)
  assert.equal(loginResult.success, false)
})

test('checkRateLimit includes resetAt timestamp roughly 1 window into the future', async () => {
  const before = Date.now()
  const result = await checkRateLimit('rl-test-4', '10.0.0.6', 5, 60)
  const after = Date.now()

  assert.ok(result.resetAt >= before + 59_000, 'resetAt should be at least ~1 window ahead')
  assert.ok(result.resetAt <= after + 61_000, 'resetAt should not exceed 1 window + slack')
})

test('checkRateLimit blocks brute force: 20 attempts with limit 5', async () => {
  const ip = '10.0.1.1'
  const limit = 5
  const results = []
  for (let i = 0; i < 20; i++) {
    results.push(await checkRateLimit('brute-force', ip, limit, 900))
  }

  for (let i = 0; i < 5; i++) assert.equal(results[i]!.success, true)
  for (let i = 5; i < 20; i++) assert.equal(results[i]!.success, false)
})

test('getClientIP extracts first IP from x-forwarded-for', () => {
  const req = new Request('http://localhost', {
    headers: { 'x-forwarded-for': '203.0.113.1, 198.51.100.178' },
  })
  assert.equal(getClientIP(req), '203.0.113.1')
})

test('getClientIP falls back to x-real-ip', () => {
  const req = new Request('http://localhost', {
    headers: { 'x-real-ip': '203.0.113.2' },
  })
  assert.equal(getClientIP(req), '203.0.113.2')
})

test('getClientIP defaults to 127.0.0.1 when no headers', () => {
  const req = new Request('http://localhost')
  assert.equal(getClientIP(req), '127.0.0.1')
})

test('checkRateLimit strips port from keys so IPv6 bracket notation does not produce distinct entries', async () => {
  // IPv6-style keys like [::1]:3000 should be cleaned to an empty string for the host part
  const r1 = await checkRateLimit('rl-ipv6-1', '[::1]:3000', 5, 60)
  const r2 = await checkRateLimit('rl-ipv6-1', '[::1]:3000', 5, 60)

  assert.equal(r1.success, true)
  assert.equal(r2.remaining, r1.remaining - 1)
})

test('checkRateLimit uses Upstash when UPSTASH_REDIS_REST_URL is set', async () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN
  const originalFetch = globalThis.fetch

  process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'

  let fetchCallCount = 0

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    fetchCallCount++

    if (url.includes('/incr/')) {
      return new Response(JSON.stringify({ result: 1 }), { status: 200 })
    }

    if (url.includes('/expire/')) {
      return new Response(JSON.stringify({ result: 1 }), { status: 200 })
    }

    return new Response('{}', { status: 200 })
  }) as typeof fetch

  try {
    const result = await checkRateLimit('upstash-test', '10.5.5.5', 5, 60)
    assert.equal(result.success, true)
    assert.equal(result.remaining, 4)
    assert.ok(fetchCallCount >= 1, 'fetch should have been called at least once')
  } finally {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) {
      delete process.env.UPSTASH_REDIS_REST_URL
    } else {
      process.env.UPSTASH_REDIS_REST_URL = originalUrl
    }
    if (originalToken === undefined) {
      delete process.env.UPSTASH_REDIS_REST_TOKEN
    } else {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken
    }
  }
})

test('checkRateLimit Upstash path returns failure when count exceeds limit', async () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN
  const originalFetch = globalThis.fetch

  process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()

    if (url.includes('/incr/')) {
      return new Response(JSON.stringify({ result: 6 }), { status: 200 })
    }

    return new Response('{}', { status: 200 })
  }) as typeof fetch

  try {
    const result = await checkRateLimit('upstash-overlimit', '10.5.5.6', 5, 60)
    assert.equal(result.success, false)
    assert.equal(result.remaining, 0)
    assert.match(result.message ?? '', /demasiados intentos/i)
  } finally {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) {
      delete process.env.UPSTASH_REDIS_REST_URL
    } else {
      process.env.UPSTASH_REDIS_REST_URL = originalUrl
    }
    if (originalToken === undefined) {
      delete process.env.UPSTASH_REDIS_REST_TOKEN
    } else {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken
    }
  }
})

test('checkRateLimit Upstash path fails open when Redis returns non-ok response', async () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN
  const originalFetch = globalThis.fetch
  const originalConsoleError = console.error

  process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
  console.error = () => undefined

  globalThis.fetch = (async () => {
    return new Response('Service Unavailable', { status: 503 })
  }) as typeof fetch

  try {
    const result = await checkRateLimit('upstash-fail-open', '10.5.5.7', 5, 60)
    assert.equal(result.success, true)
    assert.equal(result.remaining, 5)
  } finally {
    globalThis.fetch = originalFetch
    console.error = originalConsoleError
    if (originalUrl === undefined) {
      delete process.env.UPSTASH_REDIS_REST_URL
    } else {
      process.env.UPSTASH_REDIS_REST_URL = originalUrl
    }
    if (originalToken === undefined) {
      delete process.env.UPSTASH_REDIS_REST_TOKEN
    } else {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken
    }
  }
})

test('checkRateLimit Upstash path fails open when fetch throws', async () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN
  const originalFetch = globalThis.fetch
  const originalConsoleError = console.error

  process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
  console.error = () => undefined

  globalThis.fetch = (async () => {
    throw new Error('Network error')
  }) as unknown as typeof fetch

  try {
    const result = await checkRateLimit('upstash-throw', '10.5.5.8', 5, 60)
    assert.equal(result.success, true)
    assert.equal(result.remaining, 5)
  } finally {
    globalThis.fetch = originalFetch
    console.error = originalConsoleError
    if (originalUrl === undefined) {
      delete process.env.UPSTASH_REDIS_REST_URL
    } else {
      process.env.UPSTASH_REDIS_REST_URL = originalUrl
    }
    if (originalToken === undefined) {
      delete process.env.UPSTASH_REDIS_REST_TOKEN
    } else {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken
    }
  }
})
