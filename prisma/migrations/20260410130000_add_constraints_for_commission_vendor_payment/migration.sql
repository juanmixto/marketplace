DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "CommissionRule"
    WHERE "vendorId" IS NULL AND "categoryId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot add commission_rule_must_have_target while orphan CommissionRule rows exist';
  END IF;
END $$;

ALTER TABLE "CommissionRule"
ADD CONSTRAINT "commission_rule_must_have_target"
CHECK ("vendorId" IS NOT NULL OR "categoryId" IS NOT NULL);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Vendor"
    WHERE "stripeAccountId" IS NOT NULL
    GROUP BY "stripeAccountId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add Vendor_stripeAccountId_key while duplicate stripeAccountId values exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "Vendor_stripeAccountId_key" ON "Vendor"("stripeAccountId");
