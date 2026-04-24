-- AlterEnum: add buyer-facing price-drop notification type.
-- Sent to every User who favourited a Product when the vendor
-- reduces its basePrice.
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'BUYER_FAVORITE_PRICE_DROP';
