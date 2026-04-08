-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Product_expiresAt_idx" ON "Product"("expiresAt");
