import { z } from 'zod'
import { isAllowedImageUrl } from '@/lib/image-validation'

/**
 * Shared product contract. Lifts the inline `productSchema` out of
 * `src/domains/vendors/actions.ts` so:
 *
 *   - the vendor product form (client) and the action (server) read
 *     the same shape + limits;
 *   - the freeze test pins each numeric bound (so a silent bump from
 *     max(2000) to max(5000) on `description` shows up at PR review);
 *   - the legal IVA tax-rate set is in one place — adding a rate
 *     means adding it here, with the test failing as a reminder.
 */

export const PRODUCT_NAME_LIMITS = { min: 3, max: 100 } as const
export const PRODUCT_DESCRIPTION_MAX = 2000
export const PRODUCT_UNIT_LIMITS = { min: 1, max: 20 } as const
export const PRODUCT_WEIGHT_MAX_GRAMS = 50_000
export const PRODUCT_ORIGIN_REGION_MAX = 100

/**
 * Maximum length of a single image alt-text entry (#1049). Empty
 * strings are intentionally allowed: an empty alt is the vendor's
 * explicit "I have not provided one"; the renderer falls back to the
 * product name in that case.
 */
export const PRODUCT_IMAGE_ALT_MAX = 200

/**
 * The Spanish IVA rates the marketplace currently bills at:
 *   - 0.04 → reduced (basic foodstuffs)
 *   - 0.10 → intermediate (most prepared foodstuffs)
 *   - 0.21 → standard (everything else)
 *
 * Adding a rate here is a deliberate tax-policy change — the
 * freeze test makes that explicit.
 */
export const PRODUCT_TAX_RATES = [0.04, 0.10, 0.21] as const

/**
 * Statuses a vendor may submit a product as. ACTIVE / REJECTED /
 * SUSPENDED are admin-only transitions and not in this client-facing
 * enum.
 */
export const PRODUCT_VENDOR_SUBMIT_STATUSES = ['DRAFT', 'PENDING_REVIEW'] as const

export const productSchema = z.object({
  name: z.string().min(PRODUCT_NAME_LIMITS.min, 'Mínimo 3 caracteres').max(PRODUCT_NAME_LIMITS.max),
  description: z.string().max(PRODUCT_DESCRIPTION_MAX).optional(),
  categoryId: z.string().optional(),
  basePrice: z.coerce.number().positive('Precio debe ser positivo'),
  compareAtPrice: z.coerce.number().positive().optional().nullable(),
  taxRate: z.coerce.number().refine(v => (PRODUCT_TAX_RATES as readonly number[]).includes(v), 'IVA inválido'),
  unit: z.string().min(PRODUCT_UNIT_LIMITS.min).max(PRODUCT_UNIT_LIMITS.max),
  stock: z.coerce.number().int().min(0),
  trackStock: z.coerce.boolean(),
  weightGrams: z.coerce.number().int().positive().max(PRODUCT_WEIGHT_MAX_GRAMS).optional().nullable(),
  certifications: z.array(z.string()).default([]),
  originRegion: z.string().max(PRODUCT_ORIGIN_REGION_MAX).optional(),
  images: z
    .array(z.string().refine(isAllowedImageUrl, 'URL de imagen no permitida'))
    .default([]),
  /**
   * Parallel array to `images`: same length, same order. Each entry
   * carries the alt text the vendor wrote for that photo. Validation
   * of `images.length === imageAlts.length` lives in the server
   * action so partial updates can short-circuit when only one of the
   * two fields is provided (the action mirrors the missing one from
   * the existing row). Empty strings are allowed: they mean "vendor
   * left the alt blank" and the renderer falls back to product.name.
   */
  imageAlts: z
    .array(z.string().max(PRODUCT_IMAGE_ALT_MAX, `Máximo ${PRODUCT_IMAGE_ALT_MAX} caracteres`))
    .default([]),
  expiresAt: z.string().date().optional().nullable(),
  status: z.enum(PRODUCT_VENDOR_SUBMIT_STATUSES).default('DRAFT'),
})

export type ProductInput = z.infer<typeof productSchema>
