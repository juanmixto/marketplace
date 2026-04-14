-- Phase 4b-β of the promotions & subscriptions RFC. Persists the Stripe
-- Customer id the first time a buyer starts a subscription Checkout
-- Session so every subsequent checkout + every renewal invoice reuses
-- the same customer record. Nullable because most existing buyers will
-- never need it.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
