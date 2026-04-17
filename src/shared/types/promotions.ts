import { z } from 'zod'
import { PromotionKind, PromotionScope } from '@/generated/prisma/enums'

/**
 * Shared promotion-creation contract. Lifted from
 * `src/domains/promotions/actions.ts` so the freeze test pins:
 *
 *   - Field set + numeric limits
 *   - The seven cross-field rules in the superRefine (scope ↔ target,
 *     kind ↔ value, valid date window). Drift in any of these would
 *     let inconsistent promotions through and break checkout
 *     evaluation downstream.
 *
 * `PromotionKind` and `PromotionScope` are re-exported from the
 * Prisma enums (single source of truth across DB + schema).
 */
export { PromotionKind, PromotionScope }

export const PROMOTION_KINDS = [
  PromotionKind.PERCENTAGE,
  PromotionKind.FIXED_AMOUNT,
  PromotionKind.FREE_SHIPPING,
] as const

export const PROMOTION_SCOPES = [
  PromotionScope.PRODUCT,
  PromotionScope.VENDOR,
  PromotionScope.CATEGORY,
] as const

export const PROMOTION_NAME_LIMITS = { min: 3, max: 100 } as const
export const PROMOTION_CODE_MAX = 40
export const PROMOTION_MAX_REDEMPTIONS_CAP = 1_000_000
export const PROMOTION_PER_USER_LIMIT_CAP = 1_000

export const promotionSchema = z
  .object({
    name: z.string().min(PROMOTION_NAME_LIMITS.min, 'Mínimo 3 caracteres').max(PROMOTION_NAME_LIMITS.max),
    code: z
      .string()
      .trim()
      .max(PROMOTION_CODE_MAX)
      .regex(/^[A-Z0-9_-]*$/, 'Solo mayúsculas, números, guiones y guiones bajos')
      .optional()
      .nullable(),
    kind: z.enum(PROMOTION_KINDS),
    value: z.coerce.number().min(0),
    scope: z.enum(PROMOTION_SCOPES),
    productId: z.string().min(1).optional().nullable(),
    categoryId: z.string().min(1).optional().nullable(),
    minSubtotal: z.coerce.number().min(0).optional().nullable(),
    maxRedemptions: z.coerce.number().int().positive().max(PROMOTION_MAX_REDEMPTIONS_CAP).optional().nullable(),
    perUserLimit: z.coerce.number().int().positive().max(PROMOTION_PER_USER_LIMIT_CAP).optional().nullable(),
    startsAt: z.string().datetime({ offset: true }).or(z.string().date()),
    endsAt: z.string().datetime({ offset: true }).or(z.string().date()),
  })
  .superRefine((data, ctx) => {
    // Scope ↔ target field
    if (data.scope === 'PRODUCT' && !data.productId) {
      ctx.addIssue({ code: 'custom', path: ['productId'], message: 'Selecciona un producto' })
    }
    if (data.scope === 'CATEGORY' && !data.categoryId) {
      ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Selecciona una categoría' })
    }
    if (data.scope === 'VENDOR' && (data.productId || data.categoryId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['scope'],
        message: 'Una promoción de tienda no puede apuntar a un producto o categoría',
      })
    }

    // Kind ↔ value
    if (data.kind === 'PERCENTAGE' && (data.value <= 0 || data.value > 100)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'El porcentaje debe estar entre 0 y 100' })
    }
    if (data.kind === 'FIXED_AMOUNT' && data.value <= 0) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'El descuento debe ser mayor que 0' })
    }

    // Window
    const starts = new Date(data.startsAt).getTime()
    const ends = new Date(data.endsAt).getTime()
    if (Number.isNaN(starts) || Number.isNaN(ends)) {
      ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'Fechas inválidas' })
      return
    }
    if (ends <= starts) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'La fecha de fin debe ser posterior a la de inicio',
      })
    }
  })

export type PromotionInput = z.infer<typeof promotionSchema>
