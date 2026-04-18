import test from 'node:test'
import assert from 'node:assert/strict'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'
import { resetServerEnvCache } from '@/lib/env'

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

test('getClientIP honors x-forwarded-for only when proxy trust is on', () => {
  const req = new Request('http://localhost', {
    headers: { 'x-forwarded-for': '203.0.113.1, 198.51.100.178' },
  })
  assert.equal(getClientIP(req, { trustProxy: true }), '203.0.113.1')
})

test('getClientIP prefers cf-connecting-ip over x-forwarded-for (#540)', () => {
  // Behind Cloudflare → Traefik the leftmost XFF entry is cf-edge-ip,
  // not the real client. cf-connecting-ip is Cloudflare-filled and the
  // only header guaranteed to carry the actual client IP under that
  // topology. Without this, per-IP rate limiting collapses every
  // request into the same bucket (cf-edge-ip) and ceases to be useful.
  const req = new Request('http://localhost', {
    headers: {
      'cf-connecting-ip': '203.0.113.88',
      'x-forwarded-for': '198.51.100.0, 10.0.0.1',
    },
  })
  assert.equal(getClientIP(req, { trustProxy: true }), '203.0.113.88')
})

test('getClientIP falls back to x-real-ip when proxy trust is on', () => {
  const req = new Request('http://localhost', {
    headers: { 'x-real-ip': '203.0.113.2' },
  })
  assert.equal(getClientIP(req, { trustProxy: true }), '203.0.113.2')
})

test('getClientIP defaults to 127.0.0.1 when proxy trust is on and no headers', () => {
  const req = new Request('http://localhost')
  assert.equal(getClientIP(req, { trustProxy: true }), '127.0.0.1')
})

test('getClientIP refuses to honor x-forwarded-for from untrusted clients (#172)', () => {
  // No env vars => not behind a known proxy => header MUST be ignored.
  const originalConsoleWarn = console.warn
  console.warn = () => undefined
  try {
    const spoofA = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    })
    const spoofB = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '9.9.9.9' },
    })
    const a = getClientIP(spoofA)
    const b = getClientIP(spoofB)
    assert.notEqual(a, '1.2.3.4', 'spoofed forwarded header must not become the client identity')
    assert.notEqual(b, '9.9.9.9')
    assert.equal(a, b, 'all untrusted clients should collapse into one stable bucket')
  } finally {
    console.warn = originalConsoleWarn
  }
})

test('getClientIP refuses to honor x-real-ip from untrusted clients (#172)', () => {
  const originalConsoleWarn = console.warn
  console.warn = () => undefined
  try {
    const req = new Request('http://localhost', {
      headers: { 'x-real-ip': '7.7.7.7' },
    })
    assert.notEqual(getClientIP(req), '7.7.7.7')
  } finally {
    console.warn = originalConsoleWarn
  }
})

test('getClientIP honors TRUST_PROXY_HEADERS=true env (#172)', () => {
  const original = process.env.TRUST_PROXY_HEADERS
  process.env.TRUST_PROXY_HEADERS = 'true'
  try {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '203.0.113.50' },
    })
    assert.equal(getClientIP(req), '203.0.113.50')
  } finally {
    if (original === undefined) delete process.env.TRUST_PROXY_HEADERS
    else process.env.TRUST_PROXY_HEADERS = original
  }
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
  resetServerEnvCache()

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
    resetServerEnvCache()
  }
})

test('checkRateLimit Upstash path returns failure when count exceeds limit', async () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN
  const originalFetch = globalThis.fetch

  process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
  resetServerEnvCache()

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
    resetServerEnvCache()
  }
})

test('checkRateLimit Upstash path degrades to in-memory fallback when Redis returns non-ok (#172)', async () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN
  const originalFetch = globalThis.fetch
  const originalConsoleError = console.error
  const originalConsoleWarn = console.warn

  process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
  resetServerEnvCache()
  console.error = () => undefined
  console.warn = () => undefined

  globalThis.fetch = (async () => {
    return new Response('Service Unavailable', { status: 503 })
  }) as typeof fetch

  try {
    // Without failClosed, we degrade to in-memory and STILL apply the limit
    // — never silently allow everything.
    const limit = 3
    const results = []
    for (let i = 0; i < limit + 2; i++) {
      results.push(await checkRateLimit('upstash-degrade', '10.5.5.7', limit, 60))
    }
    const allowed = results.filter(r => r.success).length
    const blocked = results.filter(r => !r.success).length
    assert.equal(allowed, limit, 'degraded mode must still apply the limit')
    assert.equal(blocked, 2)
    assert.ok(results[0]!.degraded, 'degraded flag should be set on fallback results')
  } finally {
    console.warn = originalConsoleWarn
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
    resetServerEnvCache()
  }
})

test('checkRateLimit Upstash path fails CLOSED for auth callers when fetch throws (#172)', async () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN
  const originalFetch = globalThis.fetch
  const originalConsoleError = console.error
  const originalConsoleWarn = console.warn

  process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
  resetServerEnvCache()
  console.error = () => undefined
  console.warn = () => undefined

  globalThis.fetch = (async () => {
    throw new Error('Network error')
  }) as unknown as typeof fetch

  try {
    const result = await checkRateLimit('upstash-throw-failclosed', '10.5.5.8', 5, 60, { failClosed: true })
    assert.equal(result.success, false, 'auth callers must NOT see success=true under backend failure')
    assert.equal(result.remaining, 0)
    assert.ok(result.degraded, 'result should be marked as degraded')
    assert.match(result.message ?? '', /no disponible/i)
  } finally {
    globalThis.fetch = originalFetch
    console.error = originalConsoleError
    console.warn = originalConsoleWarn
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
    resetServerEnvCache()
  }
})

test('checkRateLimit Upstash path fails CLOSED on malformed response for auth callers (#172)', async () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN
  const originalFetch = globalThis.fetch
  const originalConsoleError = console.error
  const originalConsoleWarn = console.warn

  process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
  resetServerEnvCache()
  console.error = () => undefined
  console.warn = () => undefined

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ result: 'not-a-number' }), { status: 200 })
  }) as typeof fetch

  try {
    const result = await checkRateLimit('upstash-malformed', '10.5.5.9', 5, 60, { failClosed: true })
    assert.equal(result.success, false)
    assert.ok(result.degraded)
  } finally {
    globalThis.fetch = originalFetch
    console.error = originalConsoleError
    console.warn = originalConsoleWarn
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
    resetServerEnvCache()
  }
})

test('forgot-password rate limit allows 5 then rejects (#181)', async () => {
  const ip = '10.0.0.181'
  for (let i = 0; i < 5; i += 1) {
    const ok = await checkRateLimit('forgot-password', ip, 5, 3600)
    assert.equal(ok.success, true, `attempt ${i + 1} should succeed`)
  }
  const blocked = await checkRateLimit('forgot-password', ip, 5, 3600)
  assert.equal(blocked.success, false)
  assert.equal(blocked.remaining, 0)
})

test('account-export and account-delete keep independent counters per user (#181)', async () => {
  const userA = 'user-aaaaaa'
  const userB = 'user-bbbbbb'

  for (let i = 0; i < 3; i += 1) {
    await checkRateLimit('account-export', userA, 3, 3600)
  }
  const blockedA = await checkRateLimit('account-export', userA, 3, 3600)
  assert.equal(blockedA.success, false)

  const okB = await checkRateLimit('account-export', userB, 3, 3600)
  assert.equal(okB.success, true)

  const okDelete = await checkRateLimit('account-delete', userA, 3, 3600)
  assert.equal(okDelete.success, true)
})
