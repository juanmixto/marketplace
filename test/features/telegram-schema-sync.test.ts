import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Guard against schema / generated-client / call-site drift in the
// Telegram link tables. Two real incidents in one afternoon (2026-04-19):
//
//  1. Migration 20260419170000_telegram_bot_scopes was applied to dev DB
//     but prisma/schema.prisma never picked up the new columns → the
//     /start webhook's upsert({ where: { scope_userId }}) crashed.
//
//  2. Schema was reverted to pre-scope but the running Next dev process
//     still had the scope-aware Prisma client cached in memory →
//     findUnique({ where: { userId }}) started rejecting with
//     "needs at least one of id, scope_userId, scope_chatId".
//
// Both collapse into the same class: the Prisma client's
// TelegramLinkWhereUniqueInput shape must match what the queries layer
// actually passes. We assert the on-disk schema + generated client agree
// with the call-sites below.

const ROOT = process.cwd()
const SCHEMA = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8')
const GENERATED_TL = readFileSync(
  join(ROOT, 'src/generated/prisma/models/TelegramLink.ts'),
  'utf8',
)

function modelBlock(name: string): string {
  const match = SCHEMA.match(new RegExp(`model ${name}\\s*\\{([\\s\\S]*?)\\n\\}`))
  if (!match) throw new Error(`model ${name} not found`)
  return match[1]
}

test('TelegramLink schema + generated client agree on the userId lookup', () => {
  const body = modelBlock('TelegramLink')
  const userIdUnique = /\n\s*userId\s+String\s+@unique/.test(body)
  const scopeUserIdUnique = /@@unique\(\[scope,\s*userId\]\)/.test(body)

  // The queries layer in src/domains/notifications/telegram/queries.ts
  // calls `db.telegramLink.findUnique({ where: { userId }})`. That is
  // only valid when userId is @unique in the schema. If the schema
  // switches to a compound unique, the call site must be updated in
  // the same commit — otherwise every vendor/buyer notifications page
  // load 500s.
  assert.ok(
    userIdUnique || scopeUserIdUnique,
    'TelegramLink must declare either `userId @unique` (pre-scope) or `@@unique([scope, userId])` (multi-bot).',
  )

  const generatedHasScopeUserId = /scope_userId/.test(GENERATED_TL)
  const generatedHasUserIdUnique =
    /TelegramLinkWhereUniqueInput[\s\S]{0,400}userId\??:/.test(GENERATED_TL)

  if (scopeUserIdUnique) {
    assert.ok(
      generatedHasScopeUserId,
      'schema.prisma declares @@unique([scope, userId]) but the generated Prisma client does not. Run `npx prisma generate` and commit src/generated/prisma.',
    )
  } else {
    assert.ok(
      generatedHasUserIdUnique && !generatedHasScopeUserId,
      'schema.prisma declares `userId @unique` but the generated Prisma client still exposes scope_userId. The generated client is stale — run `npx prisma generate`.',
    )
  }
})

test('migration directory and schema stay in sync about TelegramBotScope', () => {
  const scopeMigrationApplied = readdirSync(
    join(ROOT, 'prisma/migrations'),
  ).some((name) => name.endsWith('_telegram_bot_scopes'))
  const schemaHasScope = /enum TelegramBotScope\s*\{/.test(SCHEMA)

  // Incident-1 guard: the migration was added in the repo and applied
  // to dev DB, but the schema never declared the enum, so the generated
  // Prisma client silently diverged from the live DB. Both sides must
  // be updated in the same commit (or both absent).
  assert.equal(schemaHasScope, scopeMigrationApplied)
})
