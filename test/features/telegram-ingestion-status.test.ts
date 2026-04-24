import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTelegramIngestionStatus,
  type TelegramSyncRunSummary,
} from '@/components/admin/ingestion/TelegramIngestionSetupCard'

function run(overrides: Partial<TelegramSyncRunSummary> = {}): TelegramSyncRunSummary {
  return {
    chatTitle: 'Grupo test',
    status: 'OK',
    startedAt: new Date('2026-04-23T10:00:00Z'),
    finishedAt: new Date('2026-04-23T10:02:00Z'),
    fromMessageId: 12n,
    toMessageId: 16n,
    messagesFetched: 4,
    mediaFetched: 1,
    errorMessage: null,
    ...overrides,
  }
}

test('telegram ingestion status explains when the provider is still mock', () => {
  const status = buildTelegramIngestionStatus({
    providerCode: 'mock',
    sidecarConfigured: true,
    killSwitchActive: false,
    activeConnectionCount: 1,
    enabledChatCount: 1,
    messageCount: 0,
    syncRunCount: 0,
    latestSyncRun: null,
  })

  assert.equal(status.tone, 'amber')
  assert.match(status.title, /mock/i)
  assert.match(status.body, /nunca verás mensajes nuevos de Telegram/i)
})

test('telegram ingestion status explains when the sidecar is missing', () => {
  const status = buildTelegramIngestionStatus({
    providerCode: 'telethon',
    sidecarConfigured: false,
    killSwitchActive: false,
    activeConnectionCount: 1,
    enabledChatCount: 1,
    messageCount: 0,
    syncRunCount: 0,
    latestSyncRun: null,
  })

  assert.equal(status.tone, 'red')
  assert.match(status.title, /sidecar/i)
  assert.match(status.body, /TELEGRAM_SIDECAR_URL/i)
})

test('telegram ingestion status explains the first-sync state', () => {
  const status = buildTelegramIngestionStatus({
    providerCode: 'telethon',
    sidecarConfigured: true,
    killSwitchActive: false,
    activeConnectionCount: 1,
    enabledChatCount: 1,
    messageCount: 0,
    syncRunCount: 0,
    latestSyncRun: null,
  })

  assert.equal(status.tone, 'amber')
  assert.match(status.title, /aún no has lanzado/i)
})

test('telegram ingestion status marks a failed zero-message sync in red', () => {
  const status = buildTelegramIngestionStatus({
    providerCode: 'telethon',
    sidecarConfigured: true,
    killSwitchActive: false,
    activeConnectionCount: 1,
    enabledChatCount: 1,
    messageCount: 0,
    syncRunCount: 2,
    latestSyncRun: run({ status: 'FAILED', messagesFetched: 0, errorMessage: 'boom' }),
  })

  assert.equal(status.tone, 'red')
  assert.match(status.title, /falló/i)
  assert.match(status.body, /historial de syncs/i)
  assert.ok(status.bullets.some((bullet) => bullet.includes('Último sync')))
})

test('telegram ingestion status becomes green once messages are flowing', () => {
  const status = buildTelegramIngestionStatus({
    providerCode: 'telethon',
    sidecarConfigured: true,
    killSwitchActive: false,
    activeConnectionCount: 1,
    enabledChatCount: 1,
    messageCount: 42,
    syncRunCount: 3,
    latestSyncRun: run(),
  })

  assert.equal(status.tone, 'green')
  assert.match(status.title, /entrando mensajes reales/i)
})
