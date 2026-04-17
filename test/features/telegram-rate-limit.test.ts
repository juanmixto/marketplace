import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkRateLimit,
  checkInboundRateLimit,
  resetRateLimitForTest,
  resetInboundRateLimitForTest,
} from '@/domains/notifications/telegram/rate-limit'

test('rate limit allows up to 30 messages in a 5-minute window', () => {
  resetRateLimitForTest('user-a')
  const t0 = 1_000_000_000_000
  for (let i = 0; i < 30; i++) {
    assert.equal(checkRateLimit('user-a', t0 + i * 1000), true, `message ${i} should pass`)
  }
  assert.equal(checkRateLimit('user-a', t0 + 30_000), false, '31st message must be rejected')
})

test('rate limit window slides: requests age out after 5 minutes', () => {
  resetRateLimitForTest('user-b')
  const t0 = 1_000_000_000_000
  for (let i = 0; i < 30; i++) {
    checkRateLimit('user-b', t0 + i * 1000)
  }
  assert.equal(checkRateLimit('user-b', t0 + 30_000), false)

  const afterWindow = t0 + 5 * 60 * 1000 + 1000
  assert.equal(
    checkRateLimit('user-b', afterWindow),
    true,
    'after the window slides every prior timestamp is outside the cutoff',
  )
})

test('rate limit is per-user', () => {
  resetRateLimitForTest()
  const t0 = 1_000_000_000_000
  for (let i = 0; i < 30; i++) checkRateLimit('user-c', t0 + i)
  assert.equal(checkRateLimit('user-c', t0 + 100_000), false)
  assert.equal(checkRateLimit('user-d', t0 + 100_000), true, 'user-d must have an independent bucket')
})

test('inbound rate limit allows up to 60 requests per IP per minute', () => {
  resetInboundRateLimitForTest('1.2.3.4')
  const t0 = 2_000_000_000_000
  for (let i = 0; i < 60; i++) {
    assert.equal(checkInboundRateLimit('1.2.3.4', t0 + i), true)
  }
  assert.equal(checkInboundRateLimit('1.2.3.4', t0 + 60_000), false, '61st request rejected')
})

test('inbound rate limit buckets per IP', () => {
  resetInboundRateLimitForTest()
  const t0 = 2_000_000_000_000
  for (let i = 0; i < 60; i++) checkInboundRateLimit('1.2.3.4', t0 + i)
  assert.equal(checkInboundRateLimit('1.2.3.4', t0 + 500), false)
  assert.equal(checkInboundRateLimit('5.6.7.8', t0 + 500), true, 'other IPs unaffected')
})
