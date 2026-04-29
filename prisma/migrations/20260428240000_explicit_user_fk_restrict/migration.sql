-- DB audit P0.3 / GDPR (#961): make the no-cascade contract explicit at
-- the schema level for the three User relations that the account-erase
-- flow MUST NOT hard-delete.
--
-- Today these foreign keys default to NO ACTION (Prisma's default when
-- onDelete is unspecified). NO ACTION and RESTRICT both reject a hard
-- delete that would leave dangling rows, but NO ACTION is checked at
-- end-of-statement (defers to a deferred constraint check), while
-- RESTRICT fires immediately on the conflicting row. RESTRICT is the
-- explicit, declarative choice and matches the intent: "user erase
-- anonimizes, never hard-deletes — and a future migration that
-- silently turns this into Cascade would wipe 5-year tax records."
--
-- See src/app/api/account/delete/route.ts for the actual flow:
-- the user row is `update`d with deletedAt + anonimized PII, never
-- `delete`d, so RESTRICT changes nothing in normal operation.

ALTER TABLE "Order" DROP CONSTRAINT "Order_customerId_fkey";
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Review" DROP CONSTRAINT "Review_customerId_fkey";
ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Incident" DROP CONSTRAINT "Incident_customerId_fkey";
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
