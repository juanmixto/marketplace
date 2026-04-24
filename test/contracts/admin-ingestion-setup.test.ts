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
  assert.match(source, /TelegramSyncButton/)
  assert.match(source, /1 · Conectar cuenta de Telegram/)
  assert.match(source, /2 · Conexiones activas/)
  assert.match(source, /3 · Chats sincronizables/)
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
