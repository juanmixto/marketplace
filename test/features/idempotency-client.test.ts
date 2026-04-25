import test from 'node:test'
import assert from 'node:assert/strict'
import { isAlreadyProcessedError } from '@/lib/idempotency-client'

test('detects an Error with name === AlreadyProcessedError', () => {
  const err = new Error('whatever')
  err.name = 'AlreadyProcessedError'
  assert.equal(isAlreadyProcessedError(err), true)
})

test('detects by message prefix when name is lost across the boundary', () => {
  // Next.js sometimes serializes server-action errors as plain Error
  // with the original name dropped; the message survives. The helper
  // must still recognize the replay.
  const err = new Error('Idempotent replay detected: product.create/abc-123')
  assert.equal(err.name, 'Error')
  assert.equal(isAlreadyProcessedError(err), true)
})

test('returns false for unrelated errors', () => {
  assert.equal(isAlreadyProcessedError(new Error('Validation failed')), false)
  assert.equal(isAlreadyProcessedError(new Error('Not found')), false)
})

test('returns false for non-Error values', () => {
  assert.equal(isAlreadyProcessedError(undefined), false)
  assert.equal(isAlreadyProcessedError(null), false)
  assert.equal(isAlreadyProcessedError('Idempotent replay detected'), false)
  assert.equal(isAlreadyProcessedError({ message: 'Idempotent replay detected' }), false)
})
