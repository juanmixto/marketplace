-- CreateIndex: Review vendor dashboard query (vendorId + createdAt for sorted listing)
CREATE INDEX "Review_vendorId_createdAt_idx" ON "Review"("vendorId", "createdAt");

-- CreateIndex: Incident lookup by order
CREATE INDEX "Incident_orderId_idx" ON "Incident"("orderId");
