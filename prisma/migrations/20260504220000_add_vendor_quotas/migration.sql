-- #1277 #1279: per-vendor abuse budgets — blob-storage and active-products
-- caps. Defaults are generous for current artisan producers; admins can
-- bump per-vendor without a migration.
ALTER TABLE "Vendor"
  ADD COLUMN "storageBytesUsed"  BIGINT  NOT NULL DEFAULT 0,
  ADD COLUMN "storageQuotaBytes" BIGINT  NOT NULL DEFAULT 524288000,
  ADD COLUMN "maxProductsActive" INTEGER NOT NULL DEFAULT 50;
