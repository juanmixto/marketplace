-- AlterEnum: buyer-facing notification types.
-- BUYER_ORDER_STATUS is sent to the buyer when their order transitions to
-- SHIPPED / OUT_FOR_DELIVERY / DELIVERED. BUYER_FAVORITE_RESTOCK is sent
-- when a product a buyer has favourited comes back in stock.
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'BUYER_ORDER_STATUS';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'BUYER_FAVORITE_RESTOCK';
