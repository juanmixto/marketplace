import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLogEntry, serializeContext } from '@/lib/logger'

test('buildLogEntry captures level, scope and ISO timestamp', () => {
  const entry = buildLogEntry('info', 'stripe-webhook', 'received')
  assert.equal(entry.level, 'info')
  assert.equal(entry.scope, 'stripe-webhook')
  assert.equal(entry.message, 'received')
  assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/)
})

test('buildLogEntry accepts context as the second argument', () => {
  const entry = buildLogEntry('warn', 'auth', { userId: 'u-1', attempts: 3 })
  assert.equal(entry.message, undefined)
  assert.deepEqual(entry.context, { userId: 'u-1', attempts: 3 })
})

test('buildLogEntry supports both message and context together', () => {
  const entry = buildLogEntry('error', 'payments', 'capture failed', { orderId: 'o-1' })
  assert.equal(entry.message, 'capture failed')
  assert.deepEqual(entry.context, { orderId: 'o-1' })
})

test('serializeContext flattens Error instances to { name, message, stack }', () => {
  const err = new Error('boom')
  const context = serializeContext({ cause: err })!
  const serialized = context.cause as { name: string; message: string; stack?: string }
  assert.equal(serialized.name, 'Error')
  assert.equal(serialized.message, 'boom')
  assert.ok(typeof serialized.stack === 'string')
})

test('serializeContext preserves primitive and plain-object values untouched', () => {
  const input = { a: 1, b: 'two', c: null, d: { nested: true } }
  assert.deepEqual(serializeContext(input), input)
})

test('buildLogEntry omits context when none is provided', () => {
  const entry = buildLogEntry('debug', 'noop', 'ping')
  assert.equal('context' in entry, false)
})
