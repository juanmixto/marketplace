-- DB audit P0.1 (#959): out-of-order watermark for payment_intent webhooks.
--
-- Stripe does not guarantee event order. Without this column, a late
-- payment_intent.succeeded arriving after charge.refunded could mutate
-- the Payment row back to SUCCEEDED (the existing state-filter guard
-- catches the simple cases but not all interleavings). Mirrors the
-- pattern that already exists on Subscription.lastStripeEventAt.

ALTER TABLE "Payment" ADD COLUMN "lastStripeEventAt" TIMESTAMP(3);

CREATE INDEX "Payment_lastStripeEventAt_idx" ON "Payment"("lastStripeEventAt");
