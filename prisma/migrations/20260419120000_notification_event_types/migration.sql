-- AlterEnum: extend NotificationEventType with 6 new vendor alerts.
-- Postgres does not allow ALTER TYPE ... ADD VALUE inside a multi-statement
-- transaction block; we issue each ADD VALUE as an independent statement.
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'ORDER_DELIVERED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'LABEL_FAILED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'INCIDENT_OPENED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'REVIEW_RECEIVED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'PAYOUT_PAID';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'STOCK_LOW';
