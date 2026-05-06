-- #1223: synthetic-monitor flag on the three rows the synthetic
-- checkout cron exercises. Defaults to false so existing rows are
-- unaffected.
--
-- - `Vendor.synthetic`  → the dedicated monitor vendor never appears
--                          in the public producers directory.
-- - `Product.synthetic` → the dedicated monitor product never appears
--                          in the public catalog (`getAvailableProductWhere`
--                          adds `synthetic: false`).
-- - `Order.synthetic`   → marks orders the cleanup-abandoned worker
--                          may purge once they're > 24h old, even
--                          though they reached PAYMENT_CONFIRMED.
--                          Real customer orders are NEVER touched.

ALTER TABLE "Vendor"  ADD COLUMN "synthetic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "synthetic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order"   ADD COLUMN "synthetic" BOOLEAN NOT NULL DEFAULT false;

-- Helper indexes for the cleanup query (Order) and the catalog
-- filter (Product). Vendor doesn't need one — there's exactly one
-- synthetic vendor row at any time.
CREATE INDEX "Order_synthetic_placedAt_idx" ON "Order" ("synthetic", "placedAt");
CREATE INDEX "Product_synthetic_idx" ON "Product" ("synthetic");
