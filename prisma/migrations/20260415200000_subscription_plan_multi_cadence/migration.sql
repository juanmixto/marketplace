-- Phase 4b-β follow-up: allow multi-cadence subscription plans per product.
--
-- Before: each product had at most one SubscriptionPlan (productId was
-- globally unique). The vendor picked the cadence and the buyer had no
-- say — you could only subscribe at whatever frequency the vendor set.
--
-- After: a product can have up to one ACTIVE plan per cadence — e.g.
-- (cesta-mixta-huerta, WEEKLY) + (cesta-mixta-huerta, BIWEEKLY) +
-- (cesta-mixta-huerta, MONTHLY). The buyer picks on the confirmation
-- page. The uniqueness guarantee moves from `productId` alone to
-- `(productId, cadence)`.

DROP INDEX "SubscriptionPlan_productId_key";

CREATE UNIQUE INDEX "SubscriptionPlan_productId_cadence_key"
  ON "SubscriptionPlan"("productId", "cadence");
