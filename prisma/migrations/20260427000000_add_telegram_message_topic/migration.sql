-- Telegram supergroups can be partitioned into "topics" (the
-- megaphone-style channels in the app). Surface them as
-- first-class columns on the message row so the admin UI can
-- aggregate stats per topic without re-parsing rawJson on every
-- query.

ALTER TABLE "TelegramIngestionMessage"
  ADD COLUMN "topicId" BIGINT,
  ADD COLUMN "topicTitle" TEXT;

CREATE INDEX "TelegramIngestionMessage_chatId_topicId_idx"
  ON "TelegramIngestionMessage" ("chatId", "topicId");
