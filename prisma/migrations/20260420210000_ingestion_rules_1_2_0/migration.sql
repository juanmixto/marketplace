-- rules-1.2.0: unextractable dedupe candidates for PRODUCT_NO_PRICE

CREATE TABLE "IngestionUnextractableDedupeCandidate" (
    "id" TEXT NOT NULL,
    "leftExtractionId" TEXT NOT NULL,
    "rightExtractionId" TEXT NOT NULL,
    "kind" "IngestionDedupeKind" NOT NULL,
    "riskClass" "IngestionDedupeRisk" NOT NULL,
    "reasonJson" JSONB NOT NULL,
    "autoApplied" BOOLEAN NOT NULL DEFAULT false,
    "autoAppliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionUnextractableDedupeCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IngUnxDedupe_left_right_kind_key" ON "IngestionUnextractableDedupeCandidate"("leftExtractionId", "rightExtractionId", "kind");
CREATE INDEX "IngUnxDedupe_riskClass_autoApplied_idx" ON "IngestionUnextractableDedupeCandidate"("riskClass", "autoApplied");
CREATE INDEX "IngUnxDedupe_createdAt_idx" ON "IngestionUnextractableDedupeCandidate"("createdAt");

ALTER TABLE "IngestionUnextractableDedupeCandidate" ADD CONSTRAINT "IngUnxDedupe_leftExtraction_fkey" FOREIGN KEY ("leftExtractionId") REFERENCES "IngestionExtractionResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IngestionUnextractableDedupeCandidate" ADD CONSTRAINT "IngUnxDedupe_rightExtraction_fkey" FOREIGN KEY ("rightExtractionId") REFERENCES "IngestionExtractionResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
