-- DB audit P2 (#967): pin commission rates into [0, 1].
--
-- `Vendor.commissionRate` and `CommissionRule.rate` are `Decimal(5,4)`
-- — the precision allows up to 9.9999, which is meaningless for a
-- commission percentage (and ruinous if 1.5 ever lands by typo: the
-- vendor would owe more in commission than the order value, and the
-- per-line settlement query would silently produce negative payouts).
-- The default is 0.12 and every code-side write happens through the
-- admin commission-rules form, but the column has accepted any value
-- the form chooses to send.
--
-- CHECK constraints make the invariant declarative — Postgres rejects
-- the write before it lands, regardless of which path inserted it.
-- Existing data already satisfies the range (default 0.12, no
-- known hand-edits in prod); a violation here at deploy time would
-- be a real bug surfacing, not a migration regression.
--
-- These constraints are not expressible in the Prisma DSL, so they
-- live in the migration only. The audit script
-- `scripts/audit-app-env-coherence.mjs` does not check them; the
-- guarantee is purely at the database level.

ALTER TABLE "Vendor"
  ADD CONSTRAINT "Vendor_commissionRate_range"
  CHECK ("commissionRate" >= 0 AND "commissionRate" <= 1);

ALTER TABLE "CommissionRule"
  ADD CONSTRAINT "CommissionRule_rate_range"
  CHECK ("rate" >= 0 AND "rate" <= 1);
