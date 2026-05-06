-- #966 (DB audit P2.1): replace `String` with native enum on the
-- columns whose values are already constrained at the application
-- layer to a closed set.
--
-- Scope of THIS migration: only `fundedBy` (Refund + Incident). The
-- companion `Refund.reason` field stays `String` for now because its
-- existing values are formatted strings (`"ITEM_DAMAGED · REFUND_FULL"`,
-- `"cancel · user_request"`) that don't fit a flat enum without first
-- splitting the column into `category` + `note`. That refactor is a
-- larger scope and is intentionally left for a follow-up.
--
-- Existing data:
--   - Pre-launch (state-of-the-world: 0 refunds, 0 incidents on prod
--     as of 2026-05-06). The USING cast is empty in production.
--   - In dev / staging, every emitter writes literal `'PLATFORM'` or
--     `'VENDOR'` (see `src/app/api/admin/incidents/[id]/resolve/route.ts`
--     and `src/domains/orders/use-cases/cancel-order.ts`). The cast
--     succeeds for those two literals; any other value (typo, manual
--     SQL edit) will abort the migration and surface the bad row.

CREATE TYPE "FundedBy" AS ENUM ('PLATFORM', 'VENDOR');

ALTER TABLE "Refund"
  ALTER COLUMN "fundedBy" TYPE "FundedBy"
    USING "fundedBy"::"FundedBy";

ALTER TABLE "Incident"
  ALTER COLUMN "fundedBy" TYPE "FundedBy"
    USING "fundedBy"::"FundedBy";
