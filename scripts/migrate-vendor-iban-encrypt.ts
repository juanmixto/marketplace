#!/usr/bin/env tsx
/**
 * #1347 — encrypts existing `Vendor.iban` + `Vendor.bankAccountName`
 * plaintext rows into `ibanEncrypted` / `bankAccountNameEncrypted` and
 * sets `ibanLast4`. Idempotent: rows that already have the encrypted
 * column populated are skipped. After running this in prod the
 * follow-up migration can drop the plaintext columns.
 *
 * Usage:
 *   AUTH_SECRET=... DATABASE_URL=... npx tsx scripts/migrate-vendor-iban-encrypt.ts
 *   AUTH_SECRET=... DATABASE_URL=... npx tsx scripts/migrate-vendor-iban-encrypt.ts --dry-run
 *
 * Safety: writes one row at a time, reads first to avoid `data:` mass
 * assignment. Encryption key is derived from `AUTH_SECRET` — running
 * with the wrong secret produces unrecoverable rows, so the script
 * refuses to start if `AUTH_SECRET` looks like the dev fallback.
 */

import { PrismaClient } from '../src/generated/prisma/client'
import {
  encryptIban,
  encryptBankAccountName,
  ibanLast4 as computeLast4,
} from '../src/domains/vendors/bank-crypto'

const dryRun = process.argv.includes('--dry-run')

const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
if (!secret || secret.length < 16 || /dev-only-fallback/i.test(secret)) {
  console.error('refusing to run: AUTH_SECRET missing or dev fallback')
  process.exit(2)
}

const db = new PrismaClient()

async function main() {
  // Find rows that need encryption: anything with plaintext set but
  // the encrypted column missing. NOTE: we deliberately do NOT touch
  // rows where ibanEncrypted is already populated — those have already
  // been migrated and re-encrypting would rotate the key for no reason.
  const candidates = await db.vendor.findMany({
    where: {
      OR: [
        { iban: { not: null }, ibanEncrypted: null },
        { bankAccountName: { not: null }, bankAccountNameEncrypted: null },
      ],
    },
    select: {
      id: true,
      iban: true,
      ibanEncrypted: true,
      ibanLast4: true,
      bankAccountName: true,
      bankAccountNameEncrypted: true,
    },
  })

  console.log(
    `[migrate-vendor-iban] candidates=${candidates.length} dryRun=${dryRun}`,
  )

  let updated = 0
  for (const row of candidates) {
    const data: {
      iban?: null
      ibanEncrypted?: string
      ibanLast4?: string | null
      bankAccountName?: null
      bankAccountNameEncrypted?: string
    } = {}

    if (row.iban && !row.ibanEncrypted) {
      const trimmed = row.iban.replace(/\s+/g, '').trim()
      if (trimmed.length > 0) {
        data.ibanEncrypted = encryptIban(trimmed)
        data.ibanLast4 = computeLast4(trimmed)
        // Clear plaintext only after encryption succeeded.
        data.iban = null
      }
    }
    if (row.bankAccountName && !row.bankAccountNameEncrypted) {
      const trimmed = row.bankAccountName.trim()
      if (trimmed.length > 0) {
        data.bankAccountNameEncrypted = encryptBankAccountName(trimmed)
        data.bankAccountName = null
      }
    }

    if (Object.keys(data).length === 0) continue

    if (dryRun) {
      console.log(`[migrate-vendor-iban] would update vendor=${row.id} fields=${Object.keys(data).join(',')}`)
    } else {
      await db.vendor.update({ where: { id: row.id }, data })
      updated += 1
    }
  }

  console.log(`[migrate-vendor-iban] done updated=${updated}`)
}

main()
  .catch(err => {
    console.error('[migrate-vendor-iban] failed', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
