-- WebhookDeadLetter: orphan / unresolvable webhook events for manual replay (#185).
CREATE TABLE "WebhookDeadLetter" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "eventId" TEXT,
    "eventType" TEXT NOT NULL,
    "providerRef" TEXT,
    "reason" TEXT NOT NULL,
    "payload" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDeadLetter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookDeadLetter_resolvedAt_idx" ON "WebhookDeadLetter"("resolvedAt");
CREATE INDEX "WebhookDeadLetter_provider_eventType_idx" ON "WebhookDeadLetter"("provider", "eventType");
