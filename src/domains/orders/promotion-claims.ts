import type { Prisma } from '@/generated/prisma/client'
import { PromotionAlreadyClaimedError } from './errors'

export interface AppliedPromotionClaim {
  promotionId: string
}

/**
 * Atomically claim the redemption budget for the promotions that were
 * already selected during the optimistic evaluation step.
 *
 * The SQL stays exactly the same as before; only the infrastructure detail is
 * centralized here so use-cases can read as business flow instead of raw ORM.
 */
export async function claimPromotionRedemptions(
  tx: Prisma.TransactionClient,
  appliedPromotions: Iterable<AppliedPromotionClaim>,
): Promise<void> {
  for (const applied of appliedPromotions) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma $executeRaw tagged-template typing requires cast
    const updated = await (tx.$executeRaw as any)`
      UPDATE "Promotion"
      SET "redemptionCount" = "redemptionCount" + 1,
          "updatedAt" = NOW()
      WHERE id = ${applied.promotionId}
        AND "archivedAt" IS NULL
        AND (
          "maxRedemptions" IS NULL
          OR "redemptionCount" < "maxRedemptions"
        )
    `
    if (updated === 0) {
      throw new PromotionAlreadyClaimedError()
    }
  }
}
