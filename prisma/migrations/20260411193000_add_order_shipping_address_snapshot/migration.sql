ALTER TABLE "Order"
ADD COLUMN "shippingAddressSnapshot" JSONB;

UPDATE "Order" AS o
SET "shippingAddressSnapshot" = jsonb_build_object(
  'firstName', a."firstName",
  'lastName', a."lastName",
  'line1', a."line1",
  'line2', a."line2",
  'city', a."city",
  'province', a."province",
  'postalCode', a."postalCode",
  'phone', a."phone"
)
FROM "Address" AS a
WHERE o."addressId" = a."id"
  AND o."shippingAddressSnapshot" IS NULL;
