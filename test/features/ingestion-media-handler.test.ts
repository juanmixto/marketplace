import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MediaOversizeError,
  telegramMediaDownloadHandler,
  TelegramAuthRequiredError,
  TelegramChatGoneError,
  TelegramTransportError,
  type IngestionSyncDb,
  type MediaStoreFn,
  type MessageMediaWithMessage,
  type TelegramIngestionProvider,
  type TelegramMediaDownloadDeps,
} from '@/domains/ingestion'

function mediaFixture(
  overrides: Partial<MessageMediaWithMessage> = {},
): MessageMediaWithMessage {
  return {
    id: 'm1',
    messageId: 'msg1',
    fileUniqueId: 'file-A',
    kind: 'PHOTO',
    status: 'PENDING',
    blobKey: null,
    sizeBytes: null,
    mimeType: null,
    message: {
      chatId: 'chat_1',
      chat: {
        connectionId: 'conn_1',
        tgChatId: BigInt(-100),
        connection: { id: 'conn_1', status: 'ACTIVE' },
      },
    },
    ...overrides,
  }
}

function createFakeDb(seed: MessageMediaWithMessage) {
  let row: MessageMediaWithMessage | null = { ...seed }
  const db: IngestionSyncDb = {
    telegramIngestionChat: {
      async findUnique() {
        throw new Error('not used')
      },
      async update() {
        throw new Error('not used')
      },
    },
    telegramIngestionSyncRun: {
      async create() {
        throw new Error('not used')
      },
      async update() {
        throw new Error('not used')
      },
    },
    telegramIngestionMessage: {
      async upsert() {
        throw new Error('not used')
      },
    },
    telegramIngestionMessageMedia: {
      async upsert() {
        throw new Error('not used')
      },
      async findUnique({ where }) {
        if (row && row.id === where.id) return row
        return null
      },
      async update({ where, data }) {
        if (!row || row.id !== where.id)
          throw new Error('media not found in fake db')
        row = { ...row, ...data } as MessageMediaWithMessage
        return {
          id: row.id,
          messageId: row.messageId,
          fileUniqueId: row.fileUniqueId,
          kind: row.kind,
          status: row.status,
          blobKey: row.blobKey,
          sizeBytes: row.sizeBytes,
          mimeType: row.mimeType,
        }
      },
    },
    async $transaction(fn) {
      return fn(db)
    },
  }
  return { db, current: () => row, setRow: (r: MessageMediaWithMessage | null) => (row = r) }
}

function provider(
  overrides: Partial<TelegramIngestionProvider> = {},
): TelegramIngestionProvider {
  return {
    code: 'mock',
    async fetchChats() {
      throw new Error('not used')
    },
    async fetchMessages() {
      throw new Error('not used')
    },
    async fetchMedia() {
      return {
        stream: (async function* () {
          yield new Uint8Array([1, 2, 3])
        })(),
        mimeType: 'image/jpeg',
        sizeBytes: 3,
      }
    },
    ...overrides,
  }
}

function deps(
  db: IngestionSyncDb,
  p: TelegramIngestionProvider = provider(),
  extra: Partial<TelegramMediaDownloadDeps> = {},
): TelegramMediaDownloadDeps {
  const store: MediaStoreFn = async ({ stream, maxBytes }) => {
    let total = 0
    for await (const chunk of stream) {
      total += chunk.byteLength
      if (total > maxBytes) throw new MediaOversizeError(maxBytes, total)
    }
    return { blobKey: `ingestion/telegram/blob-${total}`, sizeBytes: total, mimeType: 'image/jpeg' }
  }
  return {
    db,
    provider: p,
    store,
    now: () => new Date('2026-04-20T12:00:00Z'),
    mediaMaxBytes: 1024,
    isKilled: async () => false,
    ...extra,
  }
}

// ─── Kill switch ─────────────────────────────────────────────────────────────

test('media handler returns KILLED before any I/O when kill switch is engaged', async () => {
  const fake = createFakeDb(mediaFixture())
  let providerCalled = false
  const p = provider({
    async fetchMedia() {
      providerCalled = true
      throw new Error('should not be called')
    },
  })
  const result = await telegramMediaDownloadHandler(
    { messageMediaId: 'm1' },
    deps(fake.db, p, { isKilled: async () => true }),
  )
  assert.equal(result.status, 'KILLED')
  assert.equal(providerCalled, false)
  // No mutation.
  assert.equal(fake.current()!.blobKey, null)
  assert.equal(fake.current()!.status, 'PENDING')
})

// ─── Dedupe ──────────────────────────────────────────────────────────────────

test('media handler is a no-op when blobKey is already set (dedupe invariant)', async () => {
  const fake = createFakeDb(
    mediaFixture({ blobKey: 'already/stored', status: 'DOWNLOADED', sizeBytes: 42 }),
  )
  let providerCalled = false
  const p = provider({
    async fetchMedia() {
      providerCalled = true
      throw new Error('should not be called')
    },
  })
  const result = await telegramMediaDownloadHandler(
    { messageMediaId: 'm1' },
    deps(fake.db, p),
  )
  assert.equal(result.status, 'ALREADY_DONE')
  assert.equal(providerCalled, false)
  assert.equal(fake.current()!.blobKey, 'already/stored')
})

// ─── Size cap ────────────────────────────────────────────────────────────────

test('media handler skips oversize before I/O when pre-check size exceeds cap', async () => {
  const fake = createFakeDb(mediaFixture({ sizeBytes: 100_000_000 }))
  let providerCalled = false
  const p = provider({
    async fetchMedia() {
      providerCalled = true
      throw new Error('should not be called')
    },
  })
  const result = await telegramMediaDownloadHandler(
    { messageMediaId: 'm1' },
    deps(fake.db, p, { mediaMaxBytes: 1024 }),
  )
  assert.equal(result.status, 'SKIPPED_OVERSIZE')
  assert.equal(providerCalled, false)
  assert.equal(fake.current()!.status, 'SKIPPED_OVERSIZE')
})

test('media handler marks SKIPPED_OVERSIZE if body exceeds cap mid-stream', async () => {
  const fake = createFakeDb(mediaFixture()) // no pre-check size
  const p = provider({
    async fetchMedia() {
      return {
        stream: (async function* () {
          // yield chunks that exceed the 10-byte cap only after
          // streaming starts — the pre-check can't save us here.
          yield new Uint8Array(6)
          yield new Uint8Array(6)
        })(),
        mimeType: 'video/mp4',
        sizeBytes: null,
      }
    },
  })
  const result = await telegramMediaDownloadHandler(
    { messageMediaId: 'm1' },
    deps(fake.db, p, { mediaMaxBytes: 10 }),
  )
  assert.equal(result.status, 'SKIPPED_OVERSIZE')
  assert.equal(fake.current()!.status, 'SKIPPED_OVERSIZE')
  // NO blob key was written.
  assert.equal(fake.current()!.blobKey, null)
})

// ─── Happy path ──────────────────────────────────────────────────────────────

test('media handler stores bytes and records DOWNLOADED', async () => {
  const fake = createFakeDb(mediaFixture())
  const result = await telegramMediaDownloadHandler(
    { messageMediaId: 'm1' },
    deps(fake.db),
  )
  assert.equal(result.status, 'OK')
  assert.equal(result.sizeBytes, 3)
  assert.equal(fake.current()!.status, 'DOWNLOADED')
  assert.match(fake.current()!.blobKey ?? '', /^ingestion\/telegram\/blob-/)
  assert.equal(fake.current()!.sizeBytes, 3)
})

// ─── Typed-error routing ─────────────────────────────────────────────────────

test('media handler marks SOURCE_GONE on TelegramChatGoneError (terminal)', async () => {
  const fake = createFakeDb(mediaFixture())
  const p = provider({
    async fetchMedia() {
      throw new TelegramChatGoneError('file gone')
    },
  })
  const result = await telegramMediaDownloadHandler(
    { messageMediaId: 'm1' },
    deps(fake.db, p),
  )
  assert.equal(result.status, 'SOURCE_GONE')
  assert.equal(fake.current()!.status, 'SOURCE_GONE')
})

test('media handler marks FAILED and rethrows TelegramAuthRequiredError (operator alert)', async () => {
  const fake = createFakeDb(mediaFixture())
  const p = provider({
    async fetchMedia() {
      throw new TelegramAuthRequiredError('session expired', 'conn_1')
    },
  })
  await assert.rejects(
    telegramMediaDownloadHandler({ messageMediaId: 'm1' }, deps(fake.db, p)),
    TelegramAuthRequiredError,
  )
  assert.equal(fake.current()!.status, 'FAILED')
})

test('media handler rethrows TelegramTransportError for pg-boss retry (row stays PENDING)', async () => {
  const fake = createFakeDb(mediaFixture())
  const p = provider({
    async fetchMedia() {
      throw new TelegramTransportError('sidecar boom', 503)
    },
  })
  await assert.rejects(
    telegramMediaDownloadHandler({ messageMediaId: 'm1' }, deps(fake.db, p)),
    TelegramTransportError,
  )
  // Row is still PENDING so a retry does the real work.
  assert.equal(fake.current()!.status, 'PENDING')
  assert.equal(fake.current()!.blobKey, null)
  assert.match(fake.current()!.mimeType ?? 'null', /jpeg|null/)
})

// ─── Missing row ─────────────────────────────────────────────────────────────

test('media handler returns FAILED when the media row no longer exists', async () => {
  const fake = createFakeDb(mediaFixture())
  fake.setRow(null)
  const result = await telegramMediaDownloadHandler(
    { messageMediaId: 'm1' },
    deps(fake.db),
  )
  assert.equal(result.status, 'FAILED')
})
