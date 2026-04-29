-- DB audit P0.2 (#960): close double-refund window.
--
-- Refund.providerRef previously had no UNIQUE; webhook replays of
-- charge.refunded outside the WebhookDelivery dedupe path (e.g. manual
-- replays from dead-letter, admin scripts) could insert the same Stripe
-- refund twice, double-counting against Settlement.refunds.
--
-- Also adds an explicit index on paymentId — Refund had zero indexes.

CREATE UNIQUE INDEX "Refund_providerRef_key" ON "Refund"("providerRef");

CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");
