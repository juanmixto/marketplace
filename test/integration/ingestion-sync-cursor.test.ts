import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import {
  createMockProvider,
  telegramSyncHandler,
  type IngestionSyncDb,
  type RawTelegramMessage,
} from '@/domains/ingestion'
import { resetIntegrationDatabase } from './helpers'

/**
 * Exercises the sync handler against real Postgres. The invariants
 * pinned by unit tests in `test/features/ingestion-sync-handler.test.ts`
 * are re-verified here with an actual transaction manager, so a
 * regression in Prisma upsert semantics or a migration drift would
 * fail CI.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

async function seedChat(overrides: Partial<{ lastMessageId: bigint; isEnabled: boolean }> = {}) {
  const connection = await db.telegramIngestionConnection.create({
    data: {
      label: 'Test conn',
      phoneNumberHash: 'hash-1',
      sessionRef: `sess-${Date.now()}-${Math.random()}`,
      status: 'ACTIVE',
      createdByUserId: 'u1',
    },
  })
  const chat = await db.telegramIngestionChat.create({
    data: {
      connectionId: connection.id,
      tgChatId: BigInt(-100),
      title: 'Test chat',
      kind: 'SUPERGROUP',
      isEnabled: overrides.isEnabled ?? true,
      lastMessageId: overrides.lastMessageId ?? null,
    },
  })
  return { connection, chat }
}

function msg(id: string): RawTelegramMessage {
  return {
    tgMessageId: id,
    tgAuthorId: '42',
    text: `m${id}`,
    postedAt: '2026-04-20T10:00:00Z',
    media: [],
    raw: { id },
  }
}

const nowFn = () => new Date('2026-04-20T12:00:00Z')

test('integration: sync persists messages and advances cursor', async () => {
  const { chat, connection } = await seedChat()
  const provider = createMockProvider({
    chats: [],
    messages: { '-100': [msg('1'), msg('2'), msg('3')] },
  })
  const enqueued: string[] = []
  const result = await telegramSyncHandler(
    { chatId: chat.id },
    {
      db: db as unknown as IngestionSyncDb,
      provider,
      enqueueMediaDownload: async ({ fileUniqueId }) => {
        enqueued.push(fileUniqueId)
      },
      now: nowFn,
      batchSize: 100,
      isKilled: async () => false,
    },
  )
  assert.equal(result.status, 'OK')
  assert.equal(result.messagesFetched, 3)
  assert.equal(enqueued.length, 0)

  const stored = await db.telegramIngestionMessage.findMany({
    where: { chatId: chat.id },
    orderBy: { tgMessageId: 'asc' },
  })
  assert.deepEqual(
    stored.map((m) => m.tgMessageId.toString()),
    ['1', '2', '3'],
  )
  const refreshed = await db.telegramIngestionChat.findUniqueOrThrow({
    where: { id: chat.id },
  })
  assert.equal(refreshed.lastMessageId?.toString(), '3')

  const runs = await db.telegramIngestionSyncRun.findMany({
    where: { chatId: chat.id },
  })
  assert.equal(runs.length, 1)
  assert.equal(runs[0]!.status, 'OK')
  assert.equal(runs[0]!.toMessageId?.toString(), '3')

  // Silence unused
  void connection
})

test('integration: re-running sync with same cursor does not duplicate rows', async () => {
  const { chat } = await seedChat()
  const provider = createMockProvider({
    chats: [],
    messages: { '-100': [msg('1'), msg('2'), msg('3')] },
  })
  const deps = {
    db: db as unknown as IngestionSyncDb,
    provider,
    enqueueMediaDownload: async () => {},
    now: nowFn,
    batchSize: 100,
    isKilled: async () => false,
  }
  await telegramSyncHandler({ chatId: chat.id }, deps)
  await telegramSyncHandler({ chatId: chat.id }, deps)

  const count = await db.telegramIngestionMessage.count({ where: { chatId: chat.id } })
  assert.equal(count, 3, '@@unique prevents duplicates on re-run')

  // Second run found no new messages, so cursor stays the same.
  const refreshed = await db.telegramIngestionChat.findUniqueOrThrow({
    where: { id: chat.id },
  })
  assert.equal(refreshed.lastMessageId?.toString(), '3')
})

test('integration: sync never backfills past the stored cursor', async () => {
  const { chat } = await seedChat({ lastMessageId: BigInt(5) })
  const provider = createMockProvider({
    chats: [],
    // Provider has 1..7, but cursor = 5 → only 6,7 should land.
    messages: { '-100': [msg('1'), msg('2'), msg('6'), msg('7')] },
  })
  await telegramSyncHandler(
    { chatId: chat.id },
    {
      db: db as unknown as IngestionSyncDb,
      provider,
      enqueueMediaDownload: async () => {},
      now: nowFn,
      batchSize: 100,
      isKilled: async () => false,
    },
  )
  const ids = (
    await db.telegramIngestionMessage.findMany({
      where: { chatId: chat.id },
      orderBy: { tgMessageId: 'asc' },
    })
  ).map((m) => m.tgMessageId.toString())
  assert.deepEqual(ids, ['6', '7'])
})

test('integration: handler skips a disabled chat without touching DB', async () => {
  const { chat } = await seedChat({ isEnabled: false })
  const provider = createMockProvider({
    chats: [],
    messages: { '-100': [msg('1')] },
  })
  const before = await db.telegramIngestionMessage.count()
  const beforeRuns = await db.telegramIngestionSyncRun.count()
  const result = await telegramSyncHandler(
    { chatId: chat.id },
    {
      db: db as unknown as IngestionSyncDb,
      provider,
      enqueueMediaDownload: async () => {},
      now: nowFn,
      batchSize: 100,
      isKilled: async () => false,
    },
  )
  assert.equal(result.status, 'CHAT_DISABLED')
  assert.equal(await db.telegramIngestionMessage.count(), before)
  assert.equal(await db.telegramIngestionSyncRun.count(), beforeRuns)
})

test('integration: kill switch engaged blocks all DB writes', async () => {
  const { chat } = await seedChat()
  const provider = createMockProvider({
    chats: [],
    messages: { '-100': [msg('1'), msg('2'), msg('3')] },
  })
  const result = await telegramSyncHandler(
    { chatId: chat.id },
    {
      db: db as unknown as IngestionSyncDb,
      provider,
      enqueueMediaDownload: async () => {},
      now: nowFn,
      batchSize: 100,
      isKilled: async () => true, // engaged
    },
  )
  assert.equal(result.status, 'KILLED')
  // Invariant: zero DB state mutation under kill.
  assert.equal(await db.telegramIngestionMessage.count(), 0)
  assert.equal(await db.telegramIngestionSyncRun.count(), 0)
  const refreshed = await db.telegramIngestionChat.findUniqueOrThrow({
    where: { id: chat.id },
  })
  assert.equal(refreshed.lastMessageId, null)
})
