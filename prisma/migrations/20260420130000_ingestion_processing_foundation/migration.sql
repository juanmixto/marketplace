-- CreateEnum
CREATE TYPE "IngestionExtractorEngine" AS ENUM ('RULES', 'LLM');

-- CreateEnum
CREATE TYPE "IngestionConfidenceBand" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "IngestionDraftStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'TOMBSTONED');

-- CreateEnum
CREATE TYPE "IngestionDraftKind" AS ENUM ('PRODUCT_DRAFT', 'VENDOR_DRAFT', 'DEDUPE_CANDIDATE');

-- CreateEnum
CREATE TYPE "IngestionReviewState" AS ENUM ('ENQUEUED', 'AUTO_RESOLVED');

-- CreateEnum
CREATE TYPE "IngestionDedupeKind" AS ENUM ('STRONG', 'HEURISTIC', 'SIMILARITY');

-- CreateEnum
CREATE TYPE "IngestionDedupeRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "IngestionMessageClass" AS ENUM ('PRODUCT', 'CONVERSATION', 'SPAM', 'OTHER');

-- CreateTable
CREATE TABLE "IngestionExtractionResult" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "engine" "IngestionExtractorEngine" NOT NULL DEFAULT 'RULES',
    "extractorVersion" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "inputSnapshot" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "confidenceOverall" DECIMAL(3,2) NOT NULL,
    "confidenceBand" "IngestionConfidenceBand" NOT NULL,
    "confidenceByField" JSONB NOT NULL,
    "classification" "IngestionMessageClass",
    "costTokensIn" INTEGER,
    "costTokensOut" INTEGER,
    "costUsd" DECIMAL(10,4),
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionExtractionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionVendorDraft" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "displayName" TEXT NOT NULL,
    "inferredFromMessageIds" JSONB NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "confidenceOverall" DECIMAL(3,2) NOT NULL,
    "confidenceBand" "IngestionConfidenceBand" NOT NULL,
    "status" "IngestionDraftStatus" NOT NULL DEFAULT 'PENDING',
    "canonicalDraftId" TEXT,
    "duplicateOf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionVendorDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionProductDraft" (
    "id" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "sourceExtractionId" TEXT NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "productOrdinal" INTEGER NOT NULL DEFAULT 0,
    "vendorDraftId" TEXT,
    "status" "IngestionDraftStatus" NOT NULL DEFAULT 'PENDING',
    "confidenceOverall" DECIMAL(3,2) NOT NULL,
    "confidenceBand" "IngestionConfidenceBand" NOT NULL,
    "productName" TEXT,
    "categorySlug" TEXT,
    "unit" TEXT,
    "weightGrams" INTEGER,
    "priceCents" INTEGER,
    "currencyCode" TEXT,
    "availability" TEXT,
    "rawFieldsSeen" JSONB NOT NULL,
    "canonicalDraftId" TEXT,
    "duplicateOf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionProductDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionReviewQueueItem" (
    "id" TEXT NOT NULL,
    "kind" "IngestionDraftKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "state" "IngestionReviewState" NOT NULL DEFAULT 'ENQUEUED',
    "autoResolvedReason" TEXT,
    "autoResolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionReviewQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionDedupeCandidate" (
    "id" TEXT NOT NULL,
    "leftDraftId" TEXT NOT NULL,
    "rightDraftId" TEXT NOT NULL,
    "kind" "IngestionDedupeKind" NOT NULL,
    "riskClass" "IngestionDedupeRisk" NOT NULL,
    "reasonJson" JSONB NOT NULL,
    "autoApplied" BOOLEAN NOT NULL DEFAULT false,
    "autoAppliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionDedupeCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngestionExtractionResult_messageId_extractorVersion_key" ON "IngestionExtractionResult"("messageId", "extractorVersion");

-- CreateIndex
CREATE INDEX "IngestionExtractionResult_messageId_createdAt_idx" ON "IngestionExtractionResult"("messageId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "IngestionExtractionResult_engine_extractorVersion_idx" ON "IngestionExtractionResult"("engine", "extractorVersion");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionVendorDraft_externalId_extractorVersion_key" ON "IngestionVendorDraft"("externalId", "extractorVersion");

-- CreateIndex
CREATE INDEX "IngestionVendorDraft_status_idx" ON "IngestionVendorDraft"("status");

-- CreateIndex
CREATE INDEX "IngestionVendorDraft_canonicalDraftId_idx" ON "IngestionVendorDraft"("canonicalDraftId");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionProductDraft_source_ver_ordinal_key" ON "IngestionProductDraft"("sourceMessageId", "extractorVersion", "productOrdinal");

-- CreateIndex
CREATE INDEX "IngestionProductDraft_status_createdAt_idx" ON "IngestionProductDraft"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "IngestionProductDraft_vendorDraftId_idx" ON "IngestionProductDraft"("vendorDraftId");

-- CreateIndex
CREATE INDEX "IngestionProductDraft_canonicalDraftId_idx" ON "IngestionProductDraft"("canonicalDraftId");

-- CreateIndex
CREATE INDEX "IngestionProductDraft_confidenceBand_idx" ON "IngestionProductDraft"("confidenceBand");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionReviewQueueItem_kind_targetId_key" ON "IngestionReviewQueueItem"("kind", "targetId");

-- CreateIndex
CREATE INDEX "IngestionReviewQueueItem_state_priority_createdAt_idx" ON "IngestionReviewQueueItem"("state", "priority" DESC, "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionDedupeCandidate_leftDraftId_rightDraftId_kind_key" ON "IngestionDedupeCandidate"("leftDraftId", "rightDraftId", "kind");

-- CreateIndex
CREATE INDEX "IngestionDedupeCandidate_riskClass_autoApplied_idx" ON "IngestionDedupeCandidate"("riskClass", "autoApplied");

-- CreateIndex
CREATE INDEX "IngestionDedupeCandidate_createdAt_idx" ON "IngestionDedupeCandidate"("createdAt");

-- AddForeignKey
ALTER TABLE "IngestionExtractionResult" ADD CONSTRAINT "IngestionExtractionResult_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TelegramIngestionMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionVendorDraft" ADD CONSTRAINT "IngestionVendorDraft_canonicalDraftId_fkey" FOREIGN KEY ("canonicalDraftId") REFERENCES "IngestionVendorDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionProductDraft" ADD CONSTRAINT "IngestionProductDraft_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "TelegramIngestionMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionProductDraft" ADD CONSTRAINT "IngestionProductDraft_sourceExtractionId_fkey" FOREIGN KEY ("sourceExtractionId") REFERENCES "IngestionExtractionResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionProductDraft" ADD CONSTRAINT "IngestionProductDraft_vendorDraftId_fkey" FOREIGN KEY ("vendorDraftId") REFERENCES "IngestionVendorDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionProductDraft" ADD CONSTRAINT "IngestionProductDraft_canonicalDraftId_fkey" FOREIGN KEY ("canonicalDraftId") REFERENCES "IngestionProductDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
