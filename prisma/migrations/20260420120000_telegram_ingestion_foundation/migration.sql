-- CreateEnum
CREATE TYPE "TelegramIngestionChatKind" AS ENUM ('GROUP', 'SUPERGROUP', 'CHANNEL');

-- CreateEnum
CREATE TYPE "TelegramIngestionConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "TelegramIngestionMediaKind" AS ENUM ('PHOTO', 'VIDEO', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TelegramIngestionMediaStatus" AS ENUM ('PENDING', 'DOWNLOADED', 'SKIPPED_OVERSIZE', 'SOURCE_GONE', 'FAILED');

-- CreateEnum
CREATE TYPE "TelegramIngestionSyncStatus" AS ENUM ('RUNNING', 'OK', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IngestionJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'OK', 'FAILED', 'DEAD');

-- CreateTable
CREATE TABLE "TelegramIngestionConnection" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "phoneNumberHash" TEXT NOT NULL,
    "sessionRef" TEXT NOT NULL,
    "status" "TelegramIngestionConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramIngestionConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramIngestionChat" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "tgChatId" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "TelegramIngestionChatKind" NOT NULL,
    "lastMessageId" BIGINT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "disabledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramIngestionChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramIngestionMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "tgMessageId" BIGINT NOT NULL,
    "tgAuthorId" BIGINT,
    "text" TEXT,
    "rawJson" JSONB NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tombstoned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TelegramIngestionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramIngestionMessageMedia" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileUniqueId" TEXT NOT NULL,
    "kind" "TelegramIngestionMediaKind" NOT NULL,
    "status" "TelegramIngestionMediaStatus" NOT NULL DEFAULT 'PENDING',
    "blobKey" TEXT,
    "sizeBytes" INTEGER,
    "mimeType" TEXT,
    "downloadedAt" TIMESTAMP(3),
    "lastErrorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramIngestionMessageMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramIngestionSyncRun" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "status" "TelegramIngestionSyncStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "fromMessageId" BIGINT,
    "toMessageId" BIGINT,
    "messagesFetched" INTEGER NOT NULL DEFAULT 0,
    "mediaFetched" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "correlationId" TEXT NOT NULL,

    CONSTRAINT "TelegramIngestionSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "IngestionJobStatus" NOT NULL DEFAULT 'QUEUED',
    "payloadRef" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorMsg" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramIngestionConnection_sessionRef_key" ON "TelegramIngestionConnection"("sessionRef");

-- CreateIndex
CREATE INDEX "TelegramIngestionConnection_status_idx" ON "TelegramIngestionConnection"("status");

-- CreateIndex
CREATE INDEX "TelegramIngestionConnection_createdByUserId_idx" ON "TelegramIngestionConnection"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramIngestionChat_connectionId_tgChatId_key" ON "TelegramIngestionChat"("connectionId", "tgChatId");

-- CreateIndex
CREATE INDEX "TelegramIngestionChat_isEnabled_idx" ON "TelegramIngestionChat"("isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramIngestionMessage_chatId_tgMessageId_key" ON "TelegramIngestionMessage"("chatId", "tgMessageId");

-- CreateIndex
CREATE INDEX "TelegramIngestionMessage_chatId_postedAt_idx" ON "TelegramIngestionMessage"("chatId", "postedAt" DESC);

-- CreateIndex
CREATE INDEX "TelegramIngestionMessage_tgAuthorId_idx" ON "TelegramIngestionMessage"("tgAuthorId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramIngestionMessageMedia_fileUniqueId_key" ON "TelegramIngestionMessageMedia"("fileUniqueId");

-- CreateIndex
CREATE INDEX "TelegramIngestionMessageMedia_messageId_idx" ON "TelegramIngestionMessageMedia"("messageId");

-- CreateIndex
CREATE INDEX "TelegramIngestionMessageMedia_status_idx" ON "TelegramIngestionMessageMedia"("status");

-- CreateIndex
CREATE INDEX "TelegramIngestionSyncRun_chatId_startedAt_idx" ON "TelegramIngestionSyncRun"("chatId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "TelegramIngestionSyncRun_status_idx" ON "TelegramIngestionSyncRun"("status");

-- CreateIndex
CREATE INDEX "IngestionJob_kind_status_idx" ON "IngestionJob"("kind", "status");

-- CreateIndex
CREATE INDEX "IngestionJob_status_createdAt_idx" ON "IngestionJob"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "TelegramIngestionChat" ADD CONSTRAINT "TelegramIngestionChat_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "TelegramIngestionConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramIngestionMessage" ADD CONSTRAINT "TelegramIngestionMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "TelegramIngestionChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramIngestionMessageMedia" ADD CONSTRAINT "TelegramIngestionMessageMedia_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TelegramIngestionMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramIngestionSyncRun" ADD CONSTRAINT "TelegramIngestionSyncRun_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "TelegramIngestionChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
