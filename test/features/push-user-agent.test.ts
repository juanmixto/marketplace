import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hashPushUserAgent,
  isHashedPushUserAgent,
} from '@/domains/push-notifications/user-agent'

test('hashPushUserAgent returns a stable sha256 hex digest', () => {
  const input = 'Mozilla/5.0 (Linux; Android 14)'
  const first = hashPushUserAgent(input)
  const second = hashPushUserAgent(input)

  assert.equal(first, second)
  assert.equal(first?.length, 64)
  assert.match(first ?? '', /^[a-f0-9]{64}$/)
})

test('hashPushUserAgent trims input and treats blanks as missing', () => {
  assert.equal(hashPushUserAgent('  Mozilla/5.0  '), hashPushUserAgent('Mozilla/5.0'))
  assert.equal(hashPushUserAgent(''), null)
  assert.equal(hashPushUserAgent('   '), null)
  assert.equal(hashPushUserAgent(undefined), null)
})

test('isHashedPushUserAgent recognizes sha256 hex digests', () => {
  const hash = hashPushUserAgent('Mozilla/5.0 (Linux; Android 14)')
  assert.equal(isHashedPushUserAgent(hash), true)
  assert.equal(isHashedPushUserAgent('Mozilla/5.0'), false)
  assert.equal(isHashedPushUserAgent(null), false)
})
