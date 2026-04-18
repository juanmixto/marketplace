-- #313 schema/migrations drift fixes surfaced by the new `prisma migrate diff`
-- gate in CI. Two separate issues found on main:
--
-- 1. User.passwordResetToken is declared `@unique` in schema.prisma (intended
--    to be a lookup key during reset flow), but no prior migration created the
--    unique index. The runtime code still enforced it via Prisma, but a DB
--    bypass could have allowed collisions.
-- 2. Vendor.stripeAccountId had a unique index added in migration
--    20260410130000 but schema.prisma was never updated to declare `@unique`.
--    Schema is now updated in the same PR; no DDL needed from this migration.

-- Defensive: clear any accidental duplicates before creating the unique index.
-- In practice we have a single null column since reset tokens are cleared on
-- successful reset, but the index creation will fail without this.
UPDATE "User" SET "passwordResetToken" = NULL
WHERE "passwordResetToken" IN (
  SELECT "passwordResetToken" FROM "User"
  WHERE "passwordResetToken" IS NOT NULL
  GROUP BY "passwordResetToken"
  HAVING COUNT(*) > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_passwordResetToken_key" ON "User"("passwordResetToken");
