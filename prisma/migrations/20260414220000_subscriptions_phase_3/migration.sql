-- Phase 3 of the promotions & subscriptions RFC
-- (docs/rfcs/0001-promotions-and-subscriptions.md). Introduces the
-- SubscriptionPlan model + SubscriptionCadence enum. Only vendor-side
-- CRUD — the buyer-facing Subscription instance, Stripe Subscriptions, and
-- renewal webhooks land in phase 4.

-- CreateEnum
CREATE TYPE "SubscriptionCadence" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "cadence" "SubscriptionCadence" NOT NULL,
    "priceSnapshot" DECIMAL(10,2) NOT NULL,
    "taxRateSnapshot" DECIMAL(4,3) NOT NULL,
    "cutoffDayOfWeek" INTEGER NOT NULL,
    "stripePriceId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_productId_key" ON "SubscriptionPlan"("productId");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_vendorId_archivedAt_idx" ON "SubscriptionPlan"("vendorId", "archivedAt");

-- AddForeignKey
ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
