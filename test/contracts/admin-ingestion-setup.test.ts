import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

test('admin ingestion queue page keeps the compact review shell', () => {
  const source = read('src/app/(admin)/admin/ingestion/page.tsx')
  assert.match(source, /Ingesta · Cola de revisión/)
  assert.match(source, /FlashBanner/)
  assert.match(source, /SortableTh/)
  assert.match(source, /No hay items en la cola/)
})

test('telegram setup page keeps the operational flow compact and obvious', () => {
  const source = read('src/app/(admin)/admin/ingestion/telegram/page.tsx')
  assert.match(source, /TelegramAuthForm/)
  assert.match(source, /TelegramChatPicker/)
  // Live tbody owns the per-row sync/reprocess actions now.
  assert.match(source, /TelegramChatsTableBody/)
  // The connect-account block collapses once a connection is active;
  // the chats table is the operator's primary surface and must stay.
  assert.match(source, /Conectar cuenta de Telegram/)
  assert.match(source, /Chats sincronizables/)
  // Per-chat stats — raw / processed / pending / drafts — are the
  // numbers operators triage from. Keep them pinned so a future
  // refactor does not silently drop them.
  assert.match(source, /listChatIngestionStats/)
  assert.match(source, /Crudo/)
  assert.match(source, /Procesado/)
  assert.match(source, /Pendiente/)
  assert.match(source, /Drafts/)
})

test('telegram chats live tbody keeps the action surface and ETA', () => {
  const source = read('src/components/admin/ingestion/TelegramChatsTableBody.tsx')
  assert.match(source, /TelegramSyncButton/)
  assert.match(source, /TelegramReprocessButton/)
  // Polling endpoint is the only live data source for stats.
  assert.match(source, /\/api\/admin\/ingestion\/telegram\/stats/)
  // ETA is computed from a rolling sample of `processed` counts.
  assert.match(source, /estimateEta/)
})

test('telegram ingestion setup card explains the preflight checklist and current state', () => {
  const source = read('src/components/admin/ingestion/TelegramIngestionSetupCard.tsx')
  assert.match(source, /Preflight/)
  assert.match(source, /Estado actual/)
  assert.match(source, /buildTelegramIngestionStatus/)
  assert.match(source, /Último sync/)
  assert.match(source, /primaryActionHref/)
  assert.match(source, /primaryActionLabel/)
})
