-- AlterEnum: add buyer-facing back-in-stock notification type.
-- Sent to every User who favourited a Product when its stock
-- transitions from 0 to a positive value.
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'BUYER_FAVORITE_RESTOCK';
