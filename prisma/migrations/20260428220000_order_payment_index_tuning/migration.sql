-- DB audit P1.3 (#964): tune Order + Payment indexes for the actual hot
-- query paths.
--
-- "Mis pedidos" and the admin orders list both order by `placedAt DESC`.
-- Postgres can read a btree backwards, but a DESC-declared index lets the
-- planner combine the sort with composite filters without an extra
-- backward scan node — and matches Prisma's @@index([... (sort: Desc)])
-- so the migration stays in sync with the schema's ordering hint.
--
-- Adds Payment(orderId, status) for the reconciliation path "successful
-- payments for this order"; previously a seq-scan over Payment_orderId_idx
-- with a status filter applied after.

DROP INDEX "Order_customerId_placedAt_idx";
CREATE INDEX "Order_customerId_placedAt_idx" ON "Order"("customerId", "placedAt" DESC);

DROP INDEX "Order_status_placedAt_idx";
CREATE INDEX "Order_status_placedAt_idx" ON "Order"("status", "placedAt" DESC);

CREATE INDEX "Payment_orderId_status_idx" ON "Payment"("orderId", "status");
