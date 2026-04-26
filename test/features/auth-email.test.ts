import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAuthEmail } from '@/lib/auth-email'

test('normalizeAuthEmail lowercases', () => {
  assert.equal(normalizeAuthEmail('Juan@X.com'), 'juan@x.com')
})

test('normalizeAuthEmail trims surrounding whitespace', () => {
  assert.equal(normalizeAuthEmail('  juan@x.com  '), 'juan@x.com')
})

test('normalizeAuthEmail leaves already-normalized untouched', () => {
  assert.equal(normalizeAuthEmail('juan@x.com'), 'juan@x.com')
})
