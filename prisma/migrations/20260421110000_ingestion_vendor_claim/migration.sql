-- Phase 4 PR-E: ghost-vendor claim flow. Additive only.
-- Columns are nullable so existing vendor-self-serve rows stay
-- unaffected; only ingestion-created ghosts populate them.

ALTER TABLE "Vendor" ADD COLUMN "claimCode" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "claimCodeExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Vendor_claimCode_key" ON "Vendor"("claimCode");
