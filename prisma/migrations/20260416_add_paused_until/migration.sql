-- AlterTable: add pausedUntil to Subscription
ALTER TABLE "Subscription" ADD COLUMN "pausedUntil" TIMESTAMP(3);
