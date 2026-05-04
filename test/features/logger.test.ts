import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLogEntry, serializeContext, redact } from '@/lib/logger'

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

test('redact replaces default sensitive keys with [REDACTED]', () => {
  const input = {
    password: 'hunter2',
    token: 'jwt_abc',
    name: 'visible',
    orderId: 'o-1',
    authorization: 'Bearer xxx',
    cardNumber: 'hidden',
    CVV: '123',
  }
  const result = redact(input)
  assert.equal(result.password, '[REDACTED]')
  assert.equal(result.token, '[REDACTED]')
  assert.equal(result.authorization, '[REDACTED]')
  assert.equal(result.cardNumber, '[REDACTED]')
  assert.equal(result.CVV, '[REDACTED]')
  assert.equal(result.name, 'visible')
  assert.equal(result.orderId, 'o-1')
})

test('redact accepts extra custom keys', () => {
  const result = redact({ email: 'a@b.com', phone: '12345', city: 'Madrid' }, ['email', 'phone'])
  assert.equal(result.email, '[REDACTED]')
  assert.equal(result.phone, '[REDACTED]')
  assert.equal(result.city, 'Madrid')
})

test('redact does not mutate the original object', () => {
  const input = { password: 'secret', name: 'ok' }
  const result = redact(input)
  assert.notEqual(result, input)
  assert.equal(input.password, 'secret')
  assert.equal(result.password, '[REDACTED]')
})

// ─── P1-2 (#1189): deep redact + value-pattern scrubbing ────────────────

test('redact walks nested objects (deep, not shallow)', () => {
  const result = redact({
    user: { password: 'hunter2', name: 'visible' },
    request: { headers: { authorization: 'Bearer xxx', accept: 'json' } },
  })
  const user = result.user as { password: string; name: string }
  const request = result.request as { headers: { authorization: string; accept: string } }
  assert.equal(user.password, '[REDACTED]')
  assert.equal(user.name, 'visible')
  assert.equal(request.headers.authorization, '[REDACTED]')
  assert.equal(request.headers.accept, 'json')
})

test('redact walks into arrays', () => {
  const result = redact({
    events: [
      { type: 'login', token: 't1' },
      { type: 'logout', token: 't2' },
    ],
  })
  const events = result.events as Array<{ type: string; token: string }>
  assert.equal(events[0].token, '[REDACTED]')
  assert.equal(events[1].token, '[REDACTED]')
  assert.equal(events[0].type, 'login')
})

test('redact strips emails embedded in string values', () => {
  const result = redact({ message: 'failed for user@example.com', orderId: 'o-1' })
  assert.equal(result.message, 'failed for [REDACTED]')
  assert.equal(result.orderId, 'o-1')
})

test('redact strips Stripe-shaped tokens embedded in string values', () => {
  const result = redact({ note: 'see pi_1ABCdef9876543210xyz for details' })
  assert.equal(result.note, 'see [REDACTED] for details')
})

test('redact strips JWT-shaped bearer tokens embedded in strings', () => {
  const result = redact({
    log: 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  })
  assert.match(result.log as string, /\[REDACTED\]/)
  assert.ok(!(result.log as string).includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'))
})

test('redact does not stack-overflow on circular references', () => {
  type Node = { name: string; child?: Node; password?: string }
  const root: Node = { name: 'root', password: 'leak' }
  root.child = root
  const result = redact(root as unknown as Record<string, unknown>)
  assert.equal(result.password, '[REDACTED]')
  assert.equal(result.name, 'root')
})

test('redact preserves Error instances unchanged (handled by serializeContext)', () => {
  const err = new Error('boom')
  const result = redact({ cause: err })
  assert.strictEqual(result.cause, err)
})
