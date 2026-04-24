import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createMockProvider,
  telegramSyncHandler,
  type ChatWithConnection,
  type IngestionSyncDb,
  type MessageMediaWithMessage,
  type RawTelegramMessage,
  TelegramTransportError,
  type TelegramSyncDeps,
} from '@/domains/ingestion'

/**
 * Tests for the telegram.sync handler. We inject fake `db` and
 * `provider` dependencies so assertions describe the observable
 * behaviour (rows written, cursor advance, enqueued downloads)
 * without hitting Postgres or PostHog.
 */

// ─── Fake DB ─────────────────────────────────────────────────────────────────

interface FakeMessageRow {
  id: string
  chatId: string
  tgMessageId: bigint
  tgAuthorId: bigint | null
  text: string | null
  postedAt: Date
  rawJson: unknown
}
interface FakeMediaRow {
  id: string
  messageId: string
  fileUniqueId: string
  kind: 'PHOTO' | 'VIDEO' | 'DOCUMENT' | 'OTHER'
  status: 'PENDING' | 'DOWNLOADED' | 'SKIPPED_OVERSIZE' | 'SOURCE_GONE' | 'FAILED'
  blobKey: string | null
  sizeBytes: number | null
  mimeType: string | null
}
interface FakeRunRow {
  id: string
  chatId: string
  status: 'RUNNING' | 'OK' | 'FAILED' | 'CANCELLED'
  finishedAt: Date | null
  toMessageId: bigint | null
  messagesFetched: number
  mediaFetched: number
  errorMessage: string | null
  correlationId: string
  fromMessageId: bigint | null
}

function createFakeDb(seed: { chat: ChatWithConnection }): {
  db: IngestionSyncDb
  chat: ChatWithConnection
  messages: FakeMessageRow[]
  media: FakeMediaRow[]
  runs: FakeRunRow[]
  txCount: () => number
} {
  const chat = { ...seed.chat }
  const messages: FakeMessageRow[] = []
  const media: FakeMediaRow[] = []
  const runs: FakeRunRow[] = []
  let txCalls = 0
  let nextId = 1
  const id = () => `id_${nextId++}`

  const api: IngestionSyncDb = {
    telegramIngestionChat: {
      async findUnique({ where }) {
        if (where.id !== chat.id) return null
        return chat
      },
      async update({ where, data }) {
        assert.equal(where.id, chat.id)
        if (data.lastMessageId !== undefined) chat.lastMessageId = data.lastMessageId
        if (data.isEnabled !== undefined) chat.isEnabled = data.isEnabled
        if (data.disabledReason !== undefined)
          chat.disabledReason = data.disabledReason
        return chat
      },
    },
    telegramIngestionSyncRun: {
      async create({ data }) {
        const row: FakeRunRow = {
          id: id(),
          chatId: data.chatId,
          status: 'RUNNING',
          finishedAt: null,
          toMessageId: null,
          messagesFetched: 0,
          mediaFetched: 0,
          errorMessage: null,
          correlationId: data.correlationId,
          fromMessageId: data.fromMessageId ?? null,
        }
        runs.push(row)
        return { id: row.id, chatId: row.chatId }
      },
      async update({ where, data }) {
        const row = runs.find((r) => r.id === where.id)
        if (!row) throw new Error(`run ${where.id} not found`)
        Object.assign(row, data)
        return { id: row.id, chatId: row.chatId }
      },
    },
    telegramIngestionMessage: {
      async upsert({ where, create }) {
        const existing = messages.find(
          (m) =>
            m.chatId === where.chatId_tgMessageId.chatId &&
            m.tgMessageId === where.chatId_tgMessageId.tgMessageId,
        )
        if (existing) return { id: existing.id, chatId: existing.chatId, tgMessageId: existing.tgMessageId }
        const row: FakeMessageRow = {
          id: id(),
          chatId: create.chatId,
          tgMessageId: create.tgMessageId,
          tgAuthorId: create.tgAuthorId,
          text: create.text,
          postedAt: create.postedAt,
          rawJson: create.rawJson,
        }
        messages.push(row)
        return { id: row.id, chatId: row.chatId, tgMessageId: row.tgMessageId }
      },
    },
    telegramIngestionMessageMedia: {
      async upsert({ where, create }) {
        const existing = media.find((m) => m.fileUniqueId === where.fileUniqueId)
        if (existing) return { ...existing }
        const row: FakeMediaRow = {
          id: id(),
          messageId: create.messageId,
          fileUniqueId: create.fileUniqueId,
          kind: create.kind,
          status: 'PENDING',
          blobKey: null,
          sizeBytes: create.sizeBytes,
          mimeType: create.mimeType,
        }
        media.push(row)
        return { ...row }
      },
      async findUnique() {
        throw new Error('not used in sync handler')
      },
      async update() {
        throw new Error('not used in sync handler')
      },
    },
    async $transaction(fn) {
      txCalls++
      // Real transactions roll back on throw; mirror that by
      // snapshotting the arrays and restoring on failure.
      const snap = {
        messages: [...messages],
        media: [...media],
        chat: { ...chat },
      }
      try {
        return await fn(api)
      } catch (err) {
        messages.length = 0
        messages.push(...snap.messages)
        media.length = 0
        media.push(...snap.media)
        Object.assign(chat, snap.chat)
        throw err
      }
    },
  }

  return { db: api, chat, messages, media, runs, txCount: () => txCalls }
}

function chatFixture(overrides: Partial<ChatWithConnection> = {}): ChatWithConnection {
  return {
    id: 'chat_1',
    connectionId: 'conn_1',
    tgChatId: BigInt(-100),
    title: 'Test',
    kind: 'SUPERGROUP',
    lastMessageId: null,
    isEnabled: true,
    disabledReason: null,
    connection: { id: 'conn_1', status: 'ACTIVE' },
    ...overrides,
  }
}

function msg(
  tgMessageId: string,
  opts: { mediaId?: string } = {},
): RawTelegramMessage {
  return {
    tgMessageId,
    tgAuthorId: '42',
    text: `msg ${tgMessageId}`,
    postedAt: '2026-04-20T10:00:00Z',
    media: opts.mediaId
      ? [{ fileUniqueId: opts.mediaId, kind: 'PHOTO', mimeType: null, sizeBytes: null }]
      : [],
    raw: { id: tgMessageId },
  }
}

function deps(
  db: IngestionSyncDb,
  provider = createMockProvider(),
  extra: Partial<TelegramSyncDeps> = {},
): TelegramSyncDeps {
  return {
    db,
    provider,
    enqueueMediaDownload: async () => {},
    now: () => new Date('2026-04-20T12:00:00Z'),
    batchSize: 100,
    isKilled: async () => false,
    ...extra,
  }
}

// ─── Kill switch ─────────────────────────────────────────────────────────────

test('sync handler returns KILLED before any I/O when kill switch is engaged', async () => {
  const fake = createFakeDb({ chat: chatFixture() })
  const provider = createMockProvider({
    chats: [],
    // If the handler ever calls the provider under a kill switch,
    // returning here would silently succeed — so throw instead and
    // assert no throw reaches us.
    messages: { '-100': [msg('1')] },
  })
  let providerCalled = false
  const wrapped = {
    ...provider,
    fetchMessages: async (...args: Parameters<typeof provider.fetchMessages>) => {
      providerCalled = true
      return provider.fetchMessages(...args)
    },
  }
  const result = await telegramSyncHandler(
    { chatId: 'chat_1' },
    deps(fake.db, wrapped, { isKilled: async () => true }),
  )
  assert.equal(result.status, 'KILLED')
  assert.equal(result.syncRunId, null)
  assert.equal(providerCalled, false, 'provider must not be called under kill switch')
  assert.equal(fake.runs.length, 0, 'no sync-run row must be created')
  assert.equal(fake.messages.length, 0)
})

// ─── Chat gating ─────────────────────────────────────────────────────────────

test('sync handler skips a disabled chat without opening a run', async () => {
  const fake = createFakeDb({ chat: chatFixture({ isEnabled: false }) })
  const result = await telegramSyncHandler({ chatId: 'chat_1' }, deps(fake.db))
  assert.equal(result.status, 'CHAT_DISABLED')
  assert.equal(fake.runs.length, 0)
})

test('sync handler skips when the connection is not ACTIVE', async () => {
  const fake = createFakeDb({
    chat: chatFixture({ connection: { id: 'conn_1', status: 'REVOKED' } }),
  })
  const result = await telegramSyncHandler({ chatId: 'chat_1' }, deps(fake.db))
  assert.equal(result.status, 'CHAT_DISABLED')
})

test('sync handler returns CHAT_DISABLED when chatId does not exist', async () => {
  const fake = createFakeDb({ chat: chatFixture() })
  const result = await telegramSyncHandler(
    { chatId: 'does_not_exist' },
    deps(fake.db),
  )
  assert.equal(result.status, 'CHAT_DISABLED')
})

// ─── Cursor + idempotency ────────────────────────────────────────────────────

test('sync handler persists messages and advances cursor atomically', async () => {
  const fake = createFakeDb({ chat: chatFixture() })
  const provider = createMockProvider({
    chats: [],
    messages: { '-100': [msg('1'), msg('2'), msg('3')] },
  })
  const result = await telegramSyncHandler({ chatId: 'chat_1' }, deps(fake.db, provider))
  assert.equal(result.status, 'OK')
  assert.equal(result.messagesFetched, 3)
  assert.deepEqual(
    fake.messages.map((m) => m.tgMessageId.toString()),
    ['1', '2', '3'],
  )
  assert.equal(fake.chat.lastMessageId?.toString(), '3')
  assert.equal(fake.runs.length, 1)
  assert.equal(fake.runs[0]!.status, 'OK')
  assert.equal(fake.runs[0]!.toMessageId?.toString(), '3')
  assert.equal(fake.txCount(), 1, 'exactly one transaction')
})

test('sync handler is idempotent: re-running with same cursor creates no duplicates', async () => {
  const fake = createFakeDb({ chat: chatFixture({ lastMessageId: BigInt(2) }) })
  const provider = createMockProvider({
    chats: [],
    // Provider honours the cursor and returns only messages > 2.
    messages: { '-100': [msg('1'), msg('2'), msg('3'), msg('4')] },
  })
  await telegramSyncHandler({ chatId: 'chat_1' }, deps(fake.db, provider))
  await telegramSyncHandler({ chatId: 'chat_1' }, deps(fake.db, provider))
  const ids = fake.messages.map((m) => m.tgMessageId.toString()).sort()
  assert.deepEqual(ids, ['3', '4'])
  assert.equal(fake.chat.lastMessageId?.toString(), '4')
})

test('sync handler never backfills past the stored cursor', async () => {
  const fake = createFakeDb({ chat: chatFixture({ lastMessageId: BigInt(5) }) })
  const provider = createMockProvider({
    chats: [],
    messages: { '-100': [msg('1'), msg('2'), msg('3'), msg('6'), msg('7')] },
  })
  const result = await telegramSyncHandler({ chatId: 'chat_1' }, deps(fake.db, provider))
  assert.equal(result.messagesFetched, 2)
  assert.deepEqual(
    fake.messages.map((m) => m.tgMessageId.toString()).sort(),
    ['6', '7'],
  )
})

// ─── Transaction rollback on error ───────────────────────────────────────────

test('sync handler rolls back partial batch if transaction throws', async () => {
  const fake = createFakeDb({ chat: chatFixture() })
  const provider = createMockProvider({
    chats: [],
    messages: { '-100': [msg('1'), msg('2'), msg('3')] },
  })
  // Override the message upsert to throw on the 2nd insert so the
  // transaction must roll back.
  const original = fake.db.telegramIngestionMessage.upsert
  let calls = 0
  fake.db.telegramIngestionMessage.upsert = async (args) => {
    calls++
    if (calls === 2) throw new Error('synthetic mid-batch failure')
    return original(args)
  }
  await assert.rejects(
    telegramSyncHandler({ chatId: 'chat_1' }, deps(fake.db, provider)),
    /synthetic mid-batch failure/,
  )
  // Rollback invariant: no partial message rows survive.
  assert.equal(fake.messages.length, 0)
  // Cursor is unchanged.
  assert.equal(fake.chat.lastMessageId, null)
  // Run exists and is FAILED.
  assert.equal(fake.runs.length, 1)
  assert.equal(fake.runs[0]!.status, 'FAILED')
  assert.match(fake.runs[0]!.errorMessage ?? '', /synthetic mid-batch/)
})

// ─── Chat-gone handling ──────────────────────────────────────────────────────

test('sync handler disables the chat on TelegramChatGoneError (terminal)', async () => {
  const fake = createFakeDb({ chat: chatFixture() })
  const provider = createMockProvider({
    chats: [],
    // No entry for -100 → mock throws TelegramChatGoneError
    messages: {},
  })
  const result = await telegramSyncHandler(
    { chatId: 'chat_1' },
    deps(fake.db, provider),
  )
  assert.equal(result.status, 'FAILED')
  assert.equal(fake.chat.isEnabled, false)
  assert.match(fake.chat.disabledReason ?? '', /unknown chat/)
  assert.equal(fake.runs[0]!.status, 'FAILED')
})

test('sync handler rethrows retryable TelegramTransportError so pg-boss retries', async () => {
  const fake = createFakeDb({ chat: chatFixture() })
  const provider = {
    code: 'mock' as const,
    async fetchChats() {
      return { chats: [] }
    },
    async fetchMessages() {
      throw new TelegramTransportError('sidecar boom', 503)
    },
    async fetchMedia() {
      throw new Error('not used')
    },
  }
  await assert.rejects(
    telegramSyncHandler({ chatId: 'chat_1' }, deps(fake.db, provider)),
    TelegramTransportError,
  )
  // Chat is NOT disabled — transient faults must not taint state.
  assert.equal(fake.chat.isEnabled, true)
  assert.equal(fake.runs[0]!.status, 'FAILED')
})

// ─── Media fan-out ───────────────────────────────────────────────────────────

test('sync handler enqueues one media-download per PENDING media row (dedupe by fileUniqueId)', async () => {
  const fake = createFakeDb({ chat: chatFixture() })
  const provider = createMockProvider({
    chats: [],
    messages: {
      '-100': [
        msg('1', { mediaId: 'file-A' }),
        msg('2', { mediaId: 'file-A' }), // same file — dedupe
        msg('3', { mediaId: 'file-B' }),
      ],
    },
  })
  const enqueued: Array<{ messageMediaId: string; fileUniqueId: string }> = []
  const result = await telegramSyncHandler(
    { chatId: 'chat_1' },
    deps(fake.db, provider, {
      enqueueMediaDownload: async ({ messageMediaId, fileUniqueId }) => {
        enqueued.push({ messageMediaId, fileUniqueId })
      },
    }),
  )
  assert.equal(result.status, 'OK')
  assert.equal(fake.media.length, 2, 'two media rows despite three references')
  assert.equal(enqueued.length, 2)
  assert.deepEqual(
    enqueued.map((e) => e.fileUniqueId).sort(),
    ['file-A', 'file-B'],
  )
})

test('sync handler succeeds when media enqueue fails (partial failure tolerated)', async () => {
  const fake = createFakeDb({ chat: chatFixture() })
  const provider = createMockProvider({
    chats: [],
    messages: { '-100': [msg('1', { mediaId: 'f1' })] },
  })
  const result = await telegramSyncHandler(
    { chatId: 'chat_1' },
    deps(fake.db, provider, {
      enqueueMediaDownload: async () => {
        throw new Error('queue down')
      },
    }),
  )
  assert.equal(result.status, 'OK', 'sync still succeeds')
  assert.equal(result.mediaQueued, 0)
  assert.equal(fake.messages.length, 1, 'message still persisted')
  // Media row exists; sweeper (Phase 6) can pick it up later.
  assert.equal(fake.media.length, 1)
  assert.equal(fake.media[0]!.status, 'PENDING')
})

// ─── Correlation ─────────────────────────────────────────────────────────────

test('sync handler threads correlationId through the sync run row', async () => {
  const fake = createFakeDb({ chat: chatFixture() })
  const provider = createMockProvider({
    chats: [],
    messages: { '-100': [msg('1')] },
  })
  const cid = 'cid-test-1234'
  const result = await telegramSyncHandler(
    { chatId: 'chat_1', correlationId: cid },
    deps(fake.db, provider),
  )
  assert.equal(result.correlationId, cid)
  assert.equal(fake.runs[0]!.correlationId, cid)
})

// Silence unused-var lint for the narrow helper that only exists for
// discoverability in error messages — ts-unused-exports doesn't run
// in test files, but keep the reference explicit here.
void ({} as MessageMediaWithMessage)
