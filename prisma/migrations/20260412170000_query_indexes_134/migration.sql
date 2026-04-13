-- Critical query indexes (#134)
--
-- Backs three frequent query shapes that previously triggered a full
-- scan + sort:
--   - buyer order list:           Order(customerId) ORDER BY placedAt DESC
--   - admin incidents page:       Incident ORDER BY createdAt DESC
--   - vendor fulfillments portal: VendorFulfillment(vendorId) ORDER BY createdAt
--

CREATE INDEX "Order_customerId_placedAt_idx" ON "Order"("customerId", "placedAt");
CREATE INDEX "Incident_createdAt_idx" ON "Incident"("createdAt");
CREATE INDEX "VendorFulfillment_vendorId_createdAt_idx" ON "VendorFulfillment"("vendorId", "createdAt");
