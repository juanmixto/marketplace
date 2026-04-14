-- Phase 1 of the promotions RFC (docs/rfcs/0001-promotions-and-subscriptions.md).
-- Adds Promotion table + supporting enums. Vendors can draft campaigns but
-- nothing is evaluated at checkout yet — that lands in phase 2.

-- CreateEnum
CREATE TYPE "PromotionKind" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING');

-- CreateEnum
CREATE TYPE "PromotionScope" AS ENUM ('PRODUCT', 'VENDOR', 'CATEGORY');

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "kind" "PromotionKind" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "scope" "PromotionScope" NOT NULL,
    "productId" TEXT,
    "categoryId" TEXT,
    "minSubtotal" DECIMAL(10,2),
    "maxRedemptions" INTEGER,
    "perUserLimit" INTEGER DEFAULT 1,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_vendorId_code_key" ON "Promotion"("vendorId", "code");

-- CreateIndex
CREATE INDEX "Promotion_vendorId_archivedAt_idx" ON "Promotion"("vendorId", "archivedAt");

-- CreateIndex
CREATE INDEX "Promotion_vendorId_startsAt_endsAt_idx" ON "Promotion"("vendorId", "startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
