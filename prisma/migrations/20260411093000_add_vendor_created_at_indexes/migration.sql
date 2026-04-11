-- Add composite indexes for vendor timelines and review feeds.
CREATE INDEX "OrderLine_vendorId_createdAt_idx" ON "OrderLine"("vendorId", "createdAt");
CREATE INDEX "Review_vendorId_createdAt_idx" ON "Review"("vendorId", "createdAt");
