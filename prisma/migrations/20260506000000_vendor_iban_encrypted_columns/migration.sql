-- #1347: at-rest encryption for Vendor IBAN + bank-account name.
--
-- This migration is additive: the legacy plaintext `iban` and
-- `bankAccountName` columns stay for one release while the
-- `scripts/migrate-vendor-iban-encrypt.ts` backfill encrypts existing
-- rows into the new columns. A follow-up migration drops the plaintext
-- columns once `SELECT count(*) FROM "Vendor" WHERE iban IS NOT NULL` is
-- 0 in prod.
--
-- ibanLast4 stays unencrypted so list pages and admin tables can render
-- `**** 1234` without per-row crypto operations.

ALTER TABLE "Vendor"
  ADD COLUMN "ibanEncrypted" TEXT,
  ADD COLUMN "ibanLast4" TEXT,
  ADD COLUMN "bankAccountNameEncrypted" TEXT;
