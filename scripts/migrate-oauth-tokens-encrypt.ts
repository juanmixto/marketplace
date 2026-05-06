#!/usr/bin/env tsx
/**
 * #1349 — encrypts existing `Account.refresh_token` / `id_token`
 * plaintext rows. `access_token` is nulled out because we don't use
 * it after sign-in. Idempotent: rows whose stored value is already
 * the storage wire format are skipped.
 *
 * Usage:
 *   AUTH_SECRET=... DATABASE_URL=... npx tsx scripts/migrate-oauth-tokens-encrypt.ts
 *   AUTH_SECRET=... DATABASE_URL=... npx tsx scripts/migrate-oauth-tokens-encrypt.ts --dry-run
 *
 * Safety: AUTH_SECRET-derived key is required. Running with the wrong
 * secret would silently produce unrecoverable rows, so the script
 * refuses to start with a missing or dev-fallback value.
 */

import { PrismaClient } from '../src/generated/prisma/client'
import { encryptOauthToken } from '../src/domains/auth/oauth-token-crypto'
import { isStorageWireFormat } from '../src/lib/at-rest-crypto'

const dryRun = process.argv.includes('--dry-run')

const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
if (!secret || secret.length < 16 || /dev-only-fallback/i.test(secret)) {
  console.error('refusing to run: AUTH_SECRET missing or dev fallback')
  process.exit(2)
}

const db = new PrismaClient()

async function main() {
  const candidates = await db.account.findMany({
    select: {
      id: true,
      refresh_token: true,
      access_token: true,
      id_token: true,
    },
  })

  console.log(
    `[migrate-oauth-tokens] candidates=${candidates.length} dryRun=${dryRun}`,
  )

  let updated = 0
  for (const row of candidates) {
    const data: {
      refresh_token?: string | null
      access_token?: null
      id_token?: string | null
    } = {}

    if (row.refresh_token && !isStorageWireFormat(row.refresh_token)) {
      data.refresh_token = encryptOauthToken(row.refresh_token)
    }
    if (row.id_token && !isStorageWireFormat(row.id_token)) {
      data.id_token = encryptOauthToken(row.id_token)
    }
    if (row.access_token !== null) {
      data.access_token = null
    }

    if (Object.keys(data).length === 0) continue

    if (dryRun) {
      console.log(`[migrate-oauth-tokens] would update account=${row.id} fields=${Object.keys(data).join(',')}`)
    } else {
      await db.account.update({
        where: { id: row.id },
        data: {
          refresh_token: data.refresh_token,
          access_token: data.access_token,
          id_token: data.id_token,
        },
      })
      updated += 1
    }
  }

  console.log(`[migrate-oauth-tokens] done updated=${updated}`)
}

main()
  .catch(err => {
    console.error('[migrate-oauth-tokens] failed', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
