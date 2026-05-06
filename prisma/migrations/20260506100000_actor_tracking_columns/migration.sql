-- #1359: createdBy / updatedBy as a SECOND source of actor traceability,
-- independent of `AuditLog`. If audit fails to write or the table gets
-- purged under retention policy, the high-value rows still tell us who
-- created and last modified them.
--
-- Stored as TEXT (no FK) on purpose:
--   - We want to record sentinel actors like "system" or
--     "stripe-webhook" without creating fake User rows.
--   - Foreign-key-ing to User would force ON DELETE CASCADE/RESTRICT
--     decisions that conflict with the GDPR anonimization flow
--     (anonimization keeps the User; deletion is rare). Keeping it
--     loose preserves the audit trail when the actor is later
--     anonimized.
--
-- All four columns nullable: historical rows stay null (no backfill).

ALTER TABLE "User"
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;

ALTER TABLE "Order"
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;

ALTER TABLE "Vendor"
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;

ALTER TABLE "Product"
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;
