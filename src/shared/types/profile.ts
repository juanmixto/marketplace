import { z } from 'zod'

/**
 * Shared profile contract. Phase 8 of the contract-hardening plan.
 *
 * Two consumers exist today:
 * - `src/app/api/buyers/profile/route.ts` (server validation, ES messages)
 * - `src/components/buyer/BuyerProfileForm.tsx` (client validation,
 *   i18n via `useT()`)
 *
 * Both used to copy the field shape independently. This file owns the
 * structure (which fields exist + constraints); each consumer wraps it
 * with its own messages (ES strings on the server, i18n keys on the
 * client) since the message localization model differs across the two.
 *
 * If you add a field here, both consumers must opt in explicitly.
 * That is intentional — message localization is per-surface and the
 * field-list change should be reviewed with the localization in mind.
 */
export const PROFILE_FIELD_LIMITS = {
  firstName: { min: 1, max: 50 },
  lastName: { min: 1, max: 50 },
} as const

export const profileBaseSchema = z.object({
  firstName: z
    .string()
    .min(PROFILE_FIELD_LIMITS.firstName.min)
    .max(PROFILE_FIELD_LIMITS.firstName.max),
  lastName: z
    .string()
    .min(PROFILE_FIELD_LIMITS.lastName.min)
    .max(PROFILE_FIELD_LIMITS.lastName.max),
  email: z.string().email(),
})

export type ProfileInput = z.infer<typeof profileBaseSchema>
