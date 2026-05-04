-- #1142: per-user counter the JWT callback compares against on each
-- refresh tick. Anonymisation (GDPR Article 17) and administrative
-- suspension bump it to invalidate every active session for the user.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
