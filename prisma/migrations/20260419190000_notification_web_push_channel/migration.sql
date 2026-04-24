-- AlterEnum: extend NotificationChannel with WEB_PUSH so the
-- NotificationPreference + NotificationDelivery tables can record
-- web-push deliveries alongside Telegram.
--
-- Postgres does not allow ALTER TYPE ... ADD VALUE inside a
-- multi-statement transaction block; issued as an independent
-- statement.
ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'WEB_PUSH';
