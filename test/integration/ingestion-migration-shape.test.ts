import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { resetIntegrationDatabase } from './helpers'

/**
 * Pins the shape of the TelegramIngestion* schema in the database
 * itself — catches any migration that silently drops a FK cascade,
 * loosens a unique constraint, or renames a column we rely on.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

test('ingestion: all Phase-1 tables exist and are reachable', async () => {
  const tables = await db.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'
       AND tablename IN (
         'TelegramIngestionConnection',
         'TelegramIngestionChat',
         'TelegramIngestionMessage',
         'TelegramIngestionMessageMedia',
         'TelegramIngestionSyncRun',
         'IngestionJob'
       )
       ORDER BY tablename`,
  )
  assert.deepEqual(
    tables.map((t) => t.tablename),
    [
      'IngestionJob',
      'TelegramIngestionChat',
      'TelegramIngestionConnection',
      'TelegramIngestionMessage',
      'TelegramIngestionMessageMedia',
      'TelegramIngestionSyncRun',
    ],
  )
})

test('ingestion: unique constraint on (chatId, tgMessageId) rejects duplicates', async () => {
  const conn = await db.telegramIngestionConnection.create({
    data: {
      label: 'c',
      phoneNumberHash: 'h',
      sessionRef: 'sess1',
      status: 'ACTIVE',
      createdByUserId: 'u1',
    },
  })
  const chat = await db.telegramIngestionChat.create({
    data: {
      connectionId: conn.id,
      tgChatId: BigInt(-100),
      title: 't',
      kind: 'SUPERGROUP',
      isEnabled: true,
    },
  })
  await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(1),
      tgAuthorId: null,
      text: null,
      postedAt: new Date(),
      rawJson: {},
    },
  })
  await assert.rejects(
    db.telegramIngestionMessage.create({
      data: {
        chatId: chat.id,
        tgMessageId: BigInt(1), // same (chat, id) — must reject
        tgAuthorId: null,
        text: null,
        postedAt: new Date(),
        rawJson: {},
      },
    }),
    /Unique constraint/i,
  )
})

test('ingestion: unique constraint on fileUniqueId rejects duplicate media', async () => {
  const conn = await db.telegramIngestionConnection.create({
    data: {
      label: 'c',
      phoneNumberHash: 'h',
      sessionRef: 'sess2',
      status: 'ACTIVE',
      createdByUserId: 'u1',
    },
  })
  const chat = await db.telegramIngestionChat.create({
    data: {
      connectionId: conn.id,
      tgChatId: BigInt(-101),
      title: 't',
      kind: 'SUPERGROUP',
      isEnabled: true,
    },
  })
  const msg = await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(1),
      tgAuthorId: null,
      text: null,
      postedAt: new Date(),
      rawJson: {},
    },
  })
  await db.telegramIngestionMessageMedia.create({
    data: {
      messageId: msg.id,
      fileUniqueId: 'shared-file',
      kind: 'PHOTO',
      sizeBytes: null,
      mimeType: null,
    },
  })
  const msg2 = await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(2),
      tgAuthorId: null,
      text: null,
      postedAt: new Date(),
      rawJson: {},
    },
  })
  await assert.rejects(
    db.telegramIngestionMessageMedia.create({
      data: {
        messageId: msg2.id,
        fileUniqueId: 'shared-file', // same file across messages — must reject
        kind: 'PHOTO',
        sizeBytes: null,
        mimeType: null,
      },
    }),
    /Unique constraint/i,
  )
})

test('ingestion: cascade deletes flow from connection → chat → message → media', async () => {
  const conn = await db.telegramIngestionConnection.create({
    data: {
      label: 'c',
      phoneNumberHash: 'h',
      sessionRef: 'sess3',
      status: 'ACTIVE',
      createdByUserId: 'u1',
    },
  })
  const chat = await db.telegramIngestionChat.create({
    data: {
      connectionId: conn.id,
      tgChatId: BigInt(-200),
      title: 't',
      kind: 'SUPERGROUP',
      isEnabled: true,
    },
  })
  const msg = await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: BigInt(1),
      tgAuthorId: null,
      text: null,
      postedAt: new Date(),
      rawJson: {},
    },
  })
  await db.telegramIngestionMessageMedia.create({
    data: {
      messageId: msg.id,
      fileUniqueId: 'cascade-test',
      kind: 'PHOTO',
      sizeBytes: null,
      mimeType: null,
    },
  })
  await db.telegramIngestionSyncRun.create({
    data: {
      chatId: chat.id,
      correlationId: 'cid-1',
    },
  })

  // Delete the connection → everything else must cascade.
  await db.telegramIngestionConnection.delete({ where: { id: conn.id } })

  assert.equal(await db.telegramIngestionChat.count(), 0)
  assert.equal(await db.telegramIngestionMessage.count(), 0)
  assert.equal(await db.telegramIngestionMessageMedia.count(), 0)
  assert.equal(await db.telegramIngestionSyncRun.count(), 0)
})

test('ingestion: BigInt round-trips for tgChatId / tgMessageId past 2^32', async () => {
  const conn = await db.telegramIngestionConnection.create({
    data: {
      label: 'c',
      phoneNumberHash: 'h',
      sessionRef: 'sess4',
      status: 'ACTIVE',
      createdByUserId: 'u1',
    },
  })
  const bigChat = BigInt('100123456789') // > 2^32
  const bigMsg = BigInt('9007199254740993') // > Number.MAX_SAFE_INTEGER
  const chat = await db.telegramIngestionChat.create({
    data: {
      connectionId: conn.id,
      tgChatId: bigChat,
      title: 't',
      kind: 'SUPERGROUP',
      isEnabled: true,
    },
  })
  await db.telegramIngestionMessage.create({
    data: {
      chatId: chat.id,
      tgMessageId: bigMsg,
      tgAuthorId: null,
      text: null,
      postedAt: new Date(),
      rawJson: {},
    },
  })
  const roundTripChat = await db.telegramIngestionChat.findUniqueOrThrow({
    where: { id: chat.id },
  })
  const roundTripMsg = await db.telegramIngestionMessage.findFirstOrThrow({
    where: { chatId: chat.id },
  })
  assert.equal(roundTripChat.tgChatId, bigChat)
  assert.equal(roundTripMsg.tgMessageId, bigMsg)
})
