-- #1276: per-account login lockout fields. Counter increments on every
-- failed credentials login; lockoutUntil is set when the counter crosses
-- the threshold. Both reset on a successful login.
ALTER TABLE "User"
  ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockoutUntil" TIMESTAMP(3);
