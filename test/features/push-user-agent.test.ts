import test from 'node:test'
import assert from 'node:assert/strict'
import {
  categorizePushUserAgent,
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

test('categorizePushUserAgent buckets common browser families', () => {
  assert.equal(
    categorizePushUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    ),
    'safari',
  )
  assert.equal(
    categorizePushUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    ),
    'firefox',
  )
  assert.equal(
    categorizePushUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    ),
    'chrome',
  )
  assert.equal(categorizePushUserAgent(undefined), 'other')
})
