import { z } from 'zod'
import { SubscriptionCadence } from '@/generated/prisma/enums'

/**
 * Shared subscription contracts. The plan-creation schema was
 * previously inline in `src/domains/subscriptions/actions.ts`; lifted
 * here so the freeze test can pin field set + cadence values, and the
 * vendor plan form can derive its constraints from the same source.
 *
 * `SubscriptionCadence` is the Prisma enum (single source of truth);
 * we re-export so consumers don't reach into `@/generated/prisma`.
 */
export { SubscriptionCadence }

export const SUBSCRIPTION_CADENCES = [
  SubscriptionCadence.WEEKLY,
  SubscriptionCadence.BIWEEKLY,
  SubscriptionCadence.MONTHLY,
] as const

export const subscriptionPlanSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  cadence: z.enum(SUBSCRIPTION_CADENCES),
  cutoffDayOfWeek: z.coerce.number().int().min(0).max(6),
})

export type SubscriptionPlanInput = z.infer<typeof subscriptionPlanSchema>
