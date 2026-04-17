import test from 'node:test'
import assert from 'node:assert/strict'
import {
  generateCheckoutAttemptId,
  isValidCheckoutAttemptId,
} from '@/domains/orders/checkout-token'

test('generateCheckoutAttemptId: shape matches cat_<ts36>_<32hex>', () => {
  const id = generateCheckoutAttemptId()
  assert.match(id, /^cat_[0-9a-z]+_[0-9a-f]{32}$/)
})

test('generateCheckoutAttemptId: unique under load', () => {
  const ids = new Set<string>()
  for (let i = 0; i < 2000; i += 1) ids.add(generateCheckoutAttemptId())
  assert.equal(ids.size, 2000)
})

test('isValidCheckoutAttemptId: accepts generated tokens', () => {
  for (let i = 0; i < 50; i += 1) {
    assert.equal(isValidCheckoutAttemptId(generateCheckoutAttemptId()), true)
  }
})

test('isValidCheckoutAttemptId: rejects tampered / external values', () => {
  for (const bad of [
    '',
    null,
    undefined,
    42,
    'cat',
    'cat_',
    'cat__',
    'prefix_wrong_abcdef0123456789abcdef0123456789ab',
    'cat_abc_NOTHEX_0123456789abcdef0123456789abcd',
    'cat_abc_0123456789abcdef0123456789abcdef012', // 31 chars
    'cat_abc_0123456789abcdef0123456789abcdef0123ff', // 34 chars
    "<script>alert('x')</script>",
  ]) {
    assert.equal(isValidCheckoutAttemptId(bad), false, `should reject ${JSON.stringify(bad)}`)
  }
})
