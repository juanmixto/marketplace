-- CreateTable
CREATE TABLE "AccountExportToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountExportToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountExportToken_tokenHash_key" ON "AccountExportToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountExportToken_userId_idx" ON "AccountExportToken"("userId");

-- AddForeignKey
ALTER TABLE "AccountExportToken" ADD CONSTRAINT "AccountExportToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
