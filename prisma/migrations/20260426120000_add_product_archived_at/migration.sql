-- Add archivedAt to Product so vendors can soft-archive items.
-- Distinct from deletedAt: archivedAt is vendor-restorable; deletedAt
-- is the existing admin-only soft-delete (also flips status to
-- SUSPENDED). Public catalog and vendor list views exclude rows where
-- archivedAt IS NOT NULL.
ALTER TABLE "Product" ADD COLUMN "archivedAt" TIMESTAMP(3);
