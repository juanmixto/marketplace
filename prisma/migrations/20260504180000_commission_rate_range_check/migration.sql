-- DB audit P2 (#967): pin commission rates into [0, 1] for percentages.
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
--
-- `Vendor.commissionRate` is always a percentage (no `type` column;
-- the per-vendor base commission), so [0, 1] is unconditional.
--
-- `CommissionRule.rate` is dual-typed via `CommissionRule.type`:
--   - PERCENTAGE → rate ∈ [0, 1]  (the dangerous case the audit named)
--   - FIXED      → rate is an absolute EUR amount (e.g. 1.25 €), capped
--                  by the column's Decimal(5, 4) precision (~9.9999).
-- So the CHECK on rate is gated on `type = 'PERCENTAGE'`. FIXED rules
-- are out of scope of this constraint — the seed already ships one
-- (`rule-cat-vinos`, 1.25 €) that the unconditional version rejected.
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
  CHECK (
    "type" <> 'PERCENTAGE'
    OR ("rate" >= 0 AND "rate" <= 1)
  );
