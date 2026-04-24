import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import {
  enableIngestionChat,
  listTelegramChats,
  startTelegramAuth,
  triggerChatSync,
  verifyTelegramAuth,
} from '@/domains/ingestion/telegram/actions'
import { TelegramActionError } from '@/domains/ingestion/telegram/action-errors'
import { INGESTION_ADMIN_FEATURE_FLAG } from '@/domains/ingestion'
import {
  buildSession,
  clearTestSession,
  createUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'
import { clearTestFlagOverrides, setTestFlagOverrides } from '../flags-helper'

/**
 * Phase 1 PR-C server-action coverage. The Python sidecar itself is
 * mocked at the `fetch` boundary — these tests prove the TypeScript
 * side handles every HTTP contract the real sidecar implements
 * (success, 401 auth required, 409 password required, 429 flood
 * wait, 404 chat gone).
 */

const ORIG_FETCH = globalThis.fetch
const ORIG_SIDECAR_URL = process.env.TELEGRAM_SIDECAR_URL
const ORIG_SIDECAR_TOKEN = process.env.TELEGRAM_SIDECAR_TOKEN

interface MockResponse {
  status: number
  body: unknown
}

function mockFetch(handler: (url: string, init?: RequestInit) => MockResponse) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as URL).toString()
    const res = handler(url, init)
    return new Response(JSON.stringify(res.body), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
}

async function withAdmin<T>(fn: () => Promise<T>): Promise<T> {
  const user = await createUser('ADMIN_OPS')
  useTestSession(buildSession(user.id, 'ADMIN_OPS'))
  try {
    return await fn()
  } finally {
    clearTestSession()
  }
}

beforeEach(async () => {
  await resetIntegrationDatabase()
  process.env.TELEGRAM_SIDECAR_URL = 'http://sidecar.test'
  process.env.TELEGRAM_SIDECAR_TOKEN = 'test-token'
  setTestFlagOverrides({ [INGESTION_ADMIN_FEATURE_FLAG]: true })
})

afterEach(() => {
  globalThis.fetch = ORIG_FETCH
  process.env.TELEGRAM_SIDECAR_URL = ORIG_SIDECAR_URL
  process.env.TELEGRAM_SIDECAR_TOKEN = ORIG_SIDECAR_TOKEN
  clearTestFlagOverrides()
  clearTestSession()
})

// ─── /auth/start ──────────────────────────────────────────────────────

test('startTelegramAuth: happy path creates PENDING connection + calls sidecar', async () => {
  let sidecarCalled = false
  mockFetch((url) => {
    sidecarCalled = true
    assert.match(url, /\/auth\/start$/)
    return { status: 200, body: { ok: true } }
  })
  const result = await withAdmin(() =>
    startTelegramAuth({ label: 'Ops', phoneNumber: '+34600111222' }),
  )
  assert.ok(result.connectionId)
  assert.equal(sidecarCalled, true)
  const conn = await db.telegramIngestionConnection.findUniqueOrThrow({
    where: { id: result.connectionId },
  })
  assert.equal(conn.status, 'PENDING')
  assert.ok(conn.phoneNumberHash)
  assert.notEqual(conn.phoneNumberHash, '+34600111222', 'raw phone must not be stored')
})

test('startTelegramAuth: sidecar error rolls back the DB row so no orphan PENDING connection is left', async () => {
  mockFetch(() => ({
    status: 429,
    body: { error: 'flood wait', retry_after_seconds: 30 },
  }))
  await assert.rejects(
    () => withAdmin(() => startTelegramAuth({ label: 'Ops', phoneNumber: '+34600111222' })),
    (err: unknown) => err instanceof TelegramActionError && err.reason === 'floodWait',
  )
  const count = await db.telegramIngestionConnection.count()
  assert.equal(count, 0)
})

test('startTelegramAuth: phone number validation rejects malformed input before hitting sidecar', async () => {
  let sidecarCalled = false
  mockFetch(() => {
    sidecarCalled = true
    return { status: 200, body: { ok: true } }
  })
  await assert.rejects(() =>
    withAdmin(() => startTelegramAuth({ label: 'Ops', phoneNumber: 'not-a-phone' })),
  )
  assert.equal(sidecarCalled, false)
})

// ─── /auth/verify ─────────────────────────────────────────────────────

async function seedPendingConnection(phoneHash = 'h'): Promise<string> {
  const conn = await db.telegramIngestionConnection.create({
    data: {
      label: 'Test',
      phoneNumberHash: phoneHash,
      sessionRef: `sess-${randomUUID()}`,
      status: 'PENDING',
      createdByUserId: 'admin',
    },
  })
  return conn.id
}

test('verifyTelegramAuth: happy path flips connection to ACTIVE', async () => {
  const connectionId = await seedPendingConnection()
  mockFetch((url) => {
    assert.match(url, /\/auth\/verify$/)
    return { status: 200, body: { ok: true } }
  })
  await withAdmin(() => verifyTelegramAuth({ connectionId, code: '12345' }))
  const conn = await db.telegramIngestionConnection.findUniqueOrThrow({ where: { id: connectionId } })
  assert.equal(conn.status, 'ACTIVE')
})

test('verifyTelegramAuth: 409 password_required surfaces the reason without flipping status', async () => {
  const connectionId = await seedPendingConnection()
  mockFetch(() => ({
    status: 409,
    body: { error: 'password required', password_required: true },
  }))
  await assert.rejects(
    () => withAdmin(() => verifyTelegramAuth({ connectionId, code: '12345' })),
    (err: unknown) => err instanceof TelegramActionError && err.reason === 'passwordRequired',
  )
  const conn = await db.telegramIngestionConnection.findUniqueOrThrow({ where: { id: connectionId } })
  assert.equal(conn.status, 'PENDING')
})

test('verifyTelegramAuth: invalid code is surfaced as invalidInput', async () => {
  const connectionId = await seedPendingConnection()
  mockFetch(() => ({ status: 400, body: { error: 'code invalid' } }))
  await assert.rejects(
    () => withAdmin(() => verifyTelegramAuth({ connectionId, code: '99999' })),
    (err: unknown) => err instanceof TelegramActionError && err.reason === 'invalidInput',
  )
})

// ─── /chats ───────────────────────────────────────────────────────────

test('listTelegramChats: forwards sidecar response', async () => {
  const connectionId = await seedPendingConnection()
  mockFetch((url) => {
    assert.match(url, /\/chats$/)
    return {
      status: 200,
      body: {
        chats: [
          { tgChatId: '-1001111', title: 'Productores Frutas', kind: 'SUPERGROUP' },
          { tgChatId: '-1002222', title: 'Canal oficial', kind: 'CHANNEL' },
        ],
      },
    }
  })
  const chats = await withAdmin(() => listTelegramChats({ connectionId }))
  assert.equal(chats.length, 2)
  assert.equal(chats[0]!.title, 'Productores Frutas')
})

test('listTelegramChats: 401 from sidecar surfaces as authRequired', async () => {
  const connectionId = await seedPendingConnection()
  mockFetch(() => ({ status: 401, body: { error: 'not authorized' } }))
  await assert.rejects(
    () => withAdmin(() => listTelegramChats({ connectionId })),
    (err: unknown) => err instanceof TelegramActionError && err.reason === 'authRequired',
  )
})

// ─── enableIngestionChat ──────────────────────────────────────────────

test('enableIngestionChat: refuses when connection is PENDING', async () => {
  const connectionId = await seedPendingConnection()
  await assert.rejects(
    () =>
      withAdmin(() =>
        enableIngestionChat({
          connectionId,
          tgChatId: '-1001111',
          title: 'Test group',
          kind: 'SUPERGROUP',
        }),
      ),
    (err: unknown) => err instanceof TelegramActionError && err.reason === 'connectionInactive',
  )
})

test('enableIngestionChat: creates or reactivates a chat row + audit', async () => {
  const connectionId = await seedPendingConnection()
  await db.telegramIngestionConnection.update({
    where: { id: connectionId },
    data: { status: 'ACTIVE' },
  })
  const { chatId } = await withAdmin(() =>
    enableIngestionChat({
      connectionId,
      tgChatId: '-1001111',
      title: 'Productores Frutas',
      kind: 'SUPERGROUP',
    }),
  )
  const chat = await db.telegramIngestionChat.findUniqueOrThrow({ where: { id: chatId } })
  assert.equal(chat.title, 'Productores Frutas')
  assert.equal(chat.isEnabled, true)
  const audit = await db.auditLog.findFirstOrThrow({
    where: { action: 'TELEGRAM_CHAT_ENABLED', entityId: chatId },
  })
  assert.ok(audit)
})

// ─── triggerChatSync ─────────────────────────────────────────────────

test('triggerChatSync: refuses when chat is disabled', async () => {
  const connectionId = await seedPendingConnection()
  await db.telegramIngestionConnection.update({
    where: { id: connectionId },
    data: { status: 'ACTIVE' },
  })
  const chat = await db.telegramIngestionChat.create({
    data: {
      connectionId,
      tgChatId: BigInt(-1001111),
      title: 'Disabled chat',
      kind: 'SUPERGROUP',
      isEnabled: false,
    },
  })
  await assert.rejects(
    () => withAdmin(() => triggerChatSync({ chatId: chat.id })),
    (err: unknown) => err instanceof TelegramActionError && err.reason === 'chatDisabled',
  )
})
