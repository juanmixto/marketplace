import test from 'node:test'
import assert from 'node:assert/strict'
import { expectEqual } from './test-helpers'

test('expectEqual passes on deeply equal values', () => {
  assert.doesNotThrow(() => expectEqual({ a: 1, nested: ['x'] }, { a: 1, nested: ['x'] }))
})

test('expectEqual includes a readable diff when values differ', () => {
  assert.throws(
    () => expectEqual({ a: 1, nested: ['x'] }, { a: 2, nested: ['y'] }, 'objects differ'),
    error =>
      error instanceof assert.AssertionError &&
      error.message.includes('objects differ') &&
      error.message.includes('- Expected') &&
      error.message.includes('+ Received') &&
      error.message.includes('"a": 2') &&
      error.message.includes('"a": 1'),
  )
})
