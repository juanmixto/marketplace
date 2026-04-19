-- #571 review trust + abuse controls. A flagging surface so buyers
-- and admins can report a suspicious review or vendor response
-- without editing the core review data. One report per
-- (reviewId, reporterId, target) prevents queue-spam.

CREATE TYPE "ReviewReportReason" AS ENUM ('SPAM', 'OFFENSIVE', 'OFF_TOPIC', 'FAKE', 'OTHER');
CREATE TYPE "ReviewReportTarget" AS ENUM ('REVIEW_BODY', 'VENDOR_RESPONSE');

CREATE TABLE "ReviewReport" (
  "id"         TEXT PRIMARY KEY,
  "reviewId"   TEXT NOT NULL REFERENCES "Review"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reporterId" TEXT NOT NULL REFERENCES "User"("id")   ON DELETE RESTRICT ON UPDATE CASCADE,
  "target"     "ReviewReportTarget" NOT NULL DEFAULT 'REVIEW_BODY',
  "reason"     "ReviewReportReason" NOT NULL,
  "detail"     TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ReviewReport_reviewId_reporterId_target_key"
  ON "ReviewReport"("reviewId", "reporterId", "target");

CREATE INDEX "ReviewReport_resolvedAt_idx" ON "ReviewReport"("resolvedAt");
CREATE INDEX "ReviewReport_reviewId_idx"   ON "ReviewReport"("reviewId");
