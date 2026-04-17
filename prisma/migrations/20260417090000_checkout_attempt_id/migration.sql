-- AlterTable
ALTER TABLE "Order" ADD COLUMN "checkoutAttemptId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_checkoutAttemptId_key" ON "Order"("checkoutAttemptId");
