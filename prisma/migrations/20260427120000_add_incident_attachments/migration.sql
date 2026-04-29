-- Buyers can attach photos when opening an incident (the "no llegué la
-- foto" UX gap reported on mobile). IncidentMessage already had its own
-- `attachments` array for replies; this column stores the attachments
-- submitted alongside the initial Incident.description so we don't have
-- to fabricate a synthetic first message just to hold them.
ALTER TABLE "Incident"
  ADD COLUMN "attachments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
