import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createMockProvider,
  TelegramChatGoneError,
  type MockFixture,
  type RawTelegramMessage,
} from '@/domains/ingestion'

function msg(id: string, postedAt = '2026-04-20T10:00:00Z'): RawTelegramMessage {
  return {
    tgMessageId: id,
    tgAuthorId: '42',
    text: `m${id}`,
    postedAt,
    media: [],
    raw: { id },
  }
}

test('mock.fetchChats returns configured chats', async () => {
  const provider = createMockProvider({
    chats: [{ tgChatId: '-100123', title: 'Test', kind: 'SUPERGROUP' }],
    messages: {},
  })
  const { chats } = await provider.fetchChats({ connectionId: 'c1' })
  assert.equal(chats.length, 1)
  assert.equal(chats[0]!.title, 'Test')
})

test('mock.fetchChats honours limit', async () => {
  const provider = createMockProvider({
    chats: [
      { tgChatId: '-1', title: 'a', kind: 'GROUP' },
      { tgChatId: '-2', title: 'b', kind: 'GROUP' },
      { tgChatId: '-3', title: 'c', kind: 'GROUP' },
    ],
    messages: {},
  })
  const { chats } = await provider.fetchChats({ connectionId: 'c1', limit: 2 })
  assert.equal(chats.length, 2)
})

test('mock.fetchMessages returns newest batch when cursor is null', async () => {
  const fx: MockFixture = {
    chats: [],
    messages: { '-100': [msg('1'), msg('2'), msg('3')] },
  }
  const provider = createMockProvider(fx)
  const { messages, nextFromMessageId } = await provider.fetchMessages({
    connectionId: 'c1',
    tgChatId: '-100',
    fromMessageId: null,
    limit: 10,
  })
  assert.equal(messages.length, 3)
  assert.equal(nextFromMessageId, '3')
})

test('mock.fetchMessages advances cursor strictly (fromMessageId excluded)', async () => {
  const fx: MockFixture = {
    chats: [],
    messages: { '-100': [msg('1'), msg('2'), msg('3')] },
  }
  const provider = createMockProvider(fx)
  const { messages, nextFromMessageId } = await provider.fetchMessages({
    connectionId: 'c1',
    tgChatId: '-100',
    fromMessageId: '2',
    limit: 10,
  })
  assert.deepEqual(
    messages.map((m) => m.tgMessageId),
    ['3'],
  )
  assert.equal(nextFromMessageId, '3')
})

test('mock.fetchMessages caps at limit and returns the correct cursor', async () => {
  const fx: MockFixture = {
    chats: [],
    messages: { '-100': [msg('1'), msg('2'), msg('3'), msg('4')] },
  }
  const provider = createMockProvider(fx)
  const { messages, nextFromMessageId } = await provider.fetchMessages({
    connectionId: 'c1',
    tgChatId: '-100',
    fromMessageId: '1',
    limit: 2,
  })
  assert.deepEqual(
    messages.map((m) => m.tgMessageId),
    ['2', '3'],
  )
  assert.equal(nextFromMessageId, '3')
})

test('mock.fetchMessages uses numeric (BigInt) comparison, not lexical', async () => {
  // "9" > "10" lexically but 9 < 10 numerically — the mock MUST order by
  // numeric value so the sync cursor stays correct past the 10-message mark.
  const fx: MockFixture = {
    chats: [],
    messages: { '-100': [msg('9'), msg('10'), msg('11')] },
  }
  const provider = createMockProvider(fx)
  const { messages } = await provider.fetchMessages({
    connectionId: 'c1',
    tgChatId: '-100',
    fromMessageId: null,
    limit: 10,
  })
  assert.deepEqual(
    messages.map((m) => m.tgMessageId),
    ['9', '10', '11'],
  )
})

test('mock.fetchMessages throws TelegramChatGoneError for unknown chat', async () => {
  const provider = createMockProvider()
  await assert.rejects(
    provider.fetchMessages({
      connectionId: 'c1',
      tgChatId: '-999',
      fromMessageId: null,
      limit: 10,
    }),
    TelegramChatGoneError,
  )
})

test('mock.fetchMedia streams bytes for configured fileUniqueId', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4])
  const provider = createMockProvider({
    chats: [],
    messages: {},
    media: { abc: bytes },
  })
  const { stream, sizeBytes, mimeType } = await provider.fetchMedia({
    connectionId: 'c1',
    fileUniqueId: 'abc',
  })
  assert.equal(sizeBytes, 4)
  assert.equal(mimeType, 'application/octet-stream')
  const collected: number[] = []
  for await (const chunk of stream) {
    collected.push(...chunk)
  }
  assert.deepEqual(collected, [1, 2, 3, 4])
})

test('mock.fetchMedia throws for unknown fileUniqueId', async () => {
  const provider = createMockProvider()
  await assert.rejects(
    provider.fetchMedia({ connectionId: 'c1', fileUniqueId: 'none' }),
    TelegramChatGoneError,
  )
})
