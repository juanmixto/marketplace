-- #1049 (epic #1047): persist alt text for product and vendor images.
--
-- Three new columns mirror the existing image storage:
--
--   - Product.imageAlts: parallel String[] to Product.images. The
--     application layer enforces images.length === imageAlts.length on
--     every write (server actions in src/domains/vendors/actions.ts).
--     Existing rows are backfilled with an array of empty strings of the
--     same length as their `images` column so the invariant holds out of
--     the box.
--
--   - Vendor.logoAlt / Vendor.coverImageAlt: scalar String? siblings to
--     Vendor.logo / Vendor.coverImage. Null for every existing row;
--     null on read falls back to the vendor display name in the UI.
--
-- Empty alt is meaningful (the vendor opted to leave it blank): the
-- renderer falls back to product.name / vendor.displayName, never
-- inventing copy. Explicit alt always wins.

ALTER TABLE "Product"
  ADD COLUMN "imageAlts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: every existing product gets an alts array of empty strings
-- with the same length as its images array. We use a generate_series
-- subquery to materialize one '' per image position so the array length
-- matches exactly. Products with zero images get an empty array.
UPDATE "Product"
SET "imageAlts" = COALESCE(
  (
    SELECT array_agg(''::text)
    FROM generate_series(1, array_length("images", 1))
  ),
  ARRAY[]::TEXT[]
);

ALTER TABLE "Vendor"
  ADD COLUMN "logoAlt" TEXT,
  ADD COLUMN "coverImageAlt" TEXT;
