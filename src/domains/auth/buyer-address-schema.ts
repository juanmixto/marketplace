import { z } from 'zod'
import {
  SPAIN_PROVINCE_BY_PREFIX,
  getPrefixForProvince,
  isPlausiblePhone,
  postalCodeMatchesProvince,
} from '@/domains/shipping'

const VALID_PROVINCE_NAMES = new Set(Object.values(SPAIN_PROVINCE_BY_PREFIX))

/**
 * Canonical shape of a buyer-managed shipping address. Shared by:
 *   - `src/app/api/direcciones/route.ts` (POST)
 *   - `src/app/api/direcciones/[id]/route.ts` (PUT)
 *   - `src/app/(buyer)/cuenta/direcciones/DireccionesClient.tsx`
 *
 * Keeps buyer-book validation in lock-step with the vendor and checkout
 * forms: same relaxed minimums, same postal↔province refinement, same
 * phone normalization.
 */
export const buyerAddressSchema = z
  .object({
    label: z.string().max(50).optional(),
    firstName: z.string().trim().min(1, 'Requerido').max(50),
    lastName: z.string().trim().min(1, 'Requerido').max(50),
    line1: z.string().trim().min(1, 'Escribe la dirección').max(200),
    line2: z.string().max(100).optional(),
    city: z.string().trim().min(1, 'Escribe la localidad').max(100),
    province: z
      .string()
      .trim()
      .refine(v => VALID_PROVINCE_NAMES.has(v), 'Selecciona una provincia válida'),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{5}$/, 'Código postal español: 5 dígitos'),
    phone: z
      .string()
      .trim()
      .optional()
      .refine(v => !v || isPlausiblePhone(v), 'Teléfono inválido'),
    isDefault: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (!postalCodeMatchesProvince(value.postalCode, value.province)) {
      const prefix = getPrefixForProvince(value.province)
      ctx.addIssue({
        code: 'custom',
        path: ['postalCode'],
        message: prefix
          ? `El código postal de ${value.province} debe empezar por ${prefix}`
          : 'El código postal no coincide con la provincia',
      })
    }
  })

/** Form-side input shape (pre-parse). Lets RHF keep optional fields optional. */
export type BuyerAddressInput = z.input<typeof buyerAddressSchema>
/** Server-side parsed payload (defaults applied, transforms run). */
export type BuyerAddressOutput = z.output<typeof buyerAddressSchema>
