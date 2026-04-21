-- Phase 4 PR-A: foundation for publishing approved ingestion drafts
-- as real Products. Additive only — no existing rows are mutated.

-- Provenance columns on Product. Both nullable because the vast
-- majority of existing products were created by vendor self-serve
-- and have no ingestion origin. `sourceIngestionDraftId` is UNIQUE
-- so the publish action is idempotent: approving the same draft
-- twice returns the existing Product rather than creating a duplicate.
ALTER TABLE "Product" ADD COLUMN     "sourceIngestionDraftId" TEXT;
ALTER TABLE "Product" ADD COLUMN     "sourceTelegramMessageId" TEXT;

CREATE UNIQUE INDEX "Product_sourceIngestionDraftId_key" ON "Product"("sourceIngestionDraftId");
CREATE INDEX "Product_sourceTelegramMessageId_idx" ON "Product"("sourceTelegramMessageId");

-- Fallback Category for ingestion publishes whose extracted
-- `categorySlug` does not match any existing Category row. The
-- admin-side catalog reviewer is expected to reassign these before
-- flipping the product to ACTIVE. The ID is hard-coded so the row
-- is deterministic across environments and safe to reference from
-- tests.
INSERT INTO "Category" ("id", "name", "slug", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES ('cat_uncategorized', 'Sin categoría', 'uncategorized', true, 999, NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;
