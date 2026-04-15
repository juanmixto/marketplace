-- Adds a public-facing "producer type" badge to Vendor. Nullable because
-- legacy rows default to a regex-based fallback until a human sets the
-- field. See src/domains/vendors/visuals.ts for the fallback logic.

-- CreateEnum
CREATE TYPE "VendorCategory" AS ENUM ('BAKERY', 'CHEESE', 'WINERY', 'ORCHARD', 'OLIVE_OIL', 'FARM', 'DRYLAND', 'LOCAL_PRODUCER');

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN "category" "VendorCategory";
