-- Add composite indexes for frequent buyer/vendor query patterns (#184).
CREATE INDEX "CartItem_userId_createdAt_idx" ON "CartItem"("userId", "createdAt");
CREATE INDEX "Review_productId_createdAt_idx" ON "Review"("productId", "createdAt");
CREATE INDEX "Incident_customerId_status_idx" ON "Incident"("customerId", "status");
CREATE INDEX "IncidentMessage_incidentId_createdAt_idx" ON "IncidentMessage"("incidentId", "createdAt");
