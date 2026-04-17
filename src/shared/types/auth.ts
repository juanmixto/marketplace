import { z } from 'zod'
import { PROFILE_FIELD_LIMITS } from '@/shared/types/profile'

/**
 * Shared auth contracts. The registration body shape was previously
 * declared inline inside `src/app/api/auth/register/route.ts`; now it
 * lives here so freeze tests can pin the field set + limits, and the
 * client signup form can derive its constraints from the same source.
 *
 * `firstName` / `lastName` reuse `PROFILE_FIELD_LIMITS` so a single
 * width change propagates to both registration and profile-edit flows.
 */
export const REGISTER_PASSWORD_LIMITS = {
  min: 8,
  max: 100,
} as const

export const registerSchema = z.object({
  firstName: z
    .string()
    .min(PROFILE_FIELD_LIMITS.firstName.min)
    .max(PROFILE_FIELD_LIMITS.firstName.max),
  lastName: z
    .string()
    .min(PROFILE_FIELD_LIMITS.lastName.min)
    .max(PROFILE_FIELD_LIMITS.lastName.max),
  email: z.string().email(),
  password: z.string().min(REGISTER_PASSWORD_LIMITS.min).max(REGISTER_PASSWORD_LIMITS.max),
})

export type RegisterInput = z.infer<typeof registerSchema>
