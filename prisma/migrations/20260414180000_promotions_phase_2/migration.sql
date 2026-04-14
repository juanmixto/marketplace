-- Phase 2 of the promotions RFC (docs/rfcs/0001-promotions-and-subscriptions.md).
-- Wires promotions into the checkout flow: orders now remember which
-- promotion was applied per vendor fulfillment and how much was discounted,
-- and the order-level aggregate is denormalized into Order.discountTotal for
-- reporting and display.

-- AlterTable: Order
ALTER TABLE "Order" ADD COLUMN "discountTotal" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable: VendorFulfillment
ALTER TABLE "VendorFulfillment" ADD COLUMN "promotionId" TEXT;
ALTER TABLE "VendorFulfillment" ADD COLUMN "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "VendorFulfillment_promotionId_idx" ON "VendorFulfillment"("promotionId");

-- AddForeignKey
ALTER TABLE "VendorFulfillment" ADD CONSTRAINT "VendorFulfillment_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
