import test from 'node:test'
import assert from 'node:assert/strict'
import { telegramUpdateSchema } from '@/domains/notifications/telegram/update-schema'

test('parses a /start message update', () => {
  const parsed = telegramUpdateSchema.safeParse({
    update_id: 1,
    message: {
      message_id: 10,
      from: { id: 42, username: 'juan' },
      chat: { id: 42, type: 'private' },
      date: 1700000000,
      text: '/start token123',
    },
  })
  assert.equal(parsed.success, true)
})

test('parses a callback_query update with inline message ref', () => {
  const parsed = telegramUpdateSchema.safeParse({
    update_id: 2,
    callback_query: {
      id: 'cb-1',
      from: { id: 42 },
      message: { message_id: 11, chat: { id: 42, type: 'private' } },
      data: 'confirmOrder:ord_ABC',
    },
  })
  assert.equal(parsed.success, true)
})

test('parses an update with only update_id (unknown type)', () => {
  const parsed = telegramUpdateSchema.safeParse({ update_id: 3 })
  assert.equal(parsed.success, true, 'unknown update shapes must still parse so the route returns 200')
})

test('rejects a malformed update', () => {
  const parsed = telegramUpdateSchema.safeParse({ update_id: 'not a number' })
  assert.equal(parsed.success, false)
})
