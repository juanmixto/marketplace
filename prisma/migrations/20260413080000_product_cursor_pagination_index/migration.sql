-- Composite index for cursor pagination on /productos (#89).
-- Matches the ORDER BY (status filter + createdAt desc tiebroken by id desc)
-- so deep pages stay constant-time regardless of catalog size.
CREATE INDEX "Product_status_createdAt_id_idx"
  ON "Product"("status", "createdAt" DESC, "id" DESC);
