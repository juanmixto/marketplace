import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

test('admin ingestion page surfaces the Telegram setup primer before the queue', () => {
  const source = read('src/app/(admin)/admin/ingestion/page.tsx')
  assert.match(source, /TelegramIngestionSetupCard/)
  assert.match(source, /killSwitchActive/)
  assert.match(source, /latestSyncRun/)
  assert.match(source, /primaryActionHref="\/admin\/ingestion\/telegram#telegram-connect"/)
})

test('telegram setup page shows the same onboarding primer before the connection table', () => {
  const source = read('src/app/(admin)/admin/ingestion/telegram/page.tsx')
  assert.match(source, /TelegramIngestionSetupCard/)
  assert.match(source, /Telegram operations/)
  assert.match(source, /1 · Conectar cuenta de Telegram/)
  assert.match(source, /id="telegram-connect"/)
  assert.match(source, /primaryActionHref="#telegram-connect"/)
  assert.match(source, /Últimos syncs/)
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
