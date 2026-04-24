-- AlterEnum: buyer-facing vendor-application lifecycle notifications.
-- BUYER_VENDOR_APPLICATION_APPROVED is sent when an admin approves a
-- self-service vendor application; BUYER_VENDOR_APPLICATION_REJECTED is
-- sent on rejection. Audience is BUYER because the applicant is still a
-- buyer at notification time (the role bump happens in the same tx).
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'BUYER_VENDOR_APPLICATION_APPROVED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'BUYER_VENDOR_APPLICATION_REJECTED';
