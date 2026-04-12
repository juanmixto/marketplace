-- Hash auth tokens at rest (#174)
-- Existing tokens are short-lived secrets and are dropped during migration.

DELETE FROM "EmailVerificationToken";
DELETE FROM "PasswordResetToken";

DROP INDEX IF EXISTS "EmailVerificationToken_token_idx";
DROP INDEX IF EXISTS "EmailVerificationToken_token_key";
ALTER TABLE "EmailVerificationToken" DROP COLUMN "token";
ALTER TABLE "EmailVerificationToken" ADD COLUMN "tokenHash" TEXT NOT NULL;
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

DROP INDEX IF EXISTS "PasswordResetToken_token_idx";
DROP INDEX IF EXISTS "PasswordResetToken_token_key";
ALTER TABLE "PasswordResetToken" DROP COLUMN "token";
ALTER TABLE "PasswordResetToken" ADD COLUMN "tokenHash" TEXT NOT NULL;
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
