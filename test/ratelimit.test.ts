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
