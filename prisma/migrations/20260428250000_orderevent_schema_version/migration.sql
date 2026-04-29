-- DB audit P1.4 (#965): version OrderEvent.payload so historical
-- reports can be parsed correctly after a payload-shape change.
--
-- Existing rows are tagged as version 1 (the de-facto current shape)
-- via DEFAULT 1. New rows continue to default to 1 until a writer
-- explicitly bumps the value when emitting a new shape.

ALTER TABLE "OrderEvent" ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1;
