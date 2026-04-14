'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { isVendor } from '@/lib/roles'
import { safeRevalidatePath } from '@/lib/revalidate'

// ─── Auth helper ──────────────────────────────────────────────────────────────

/**
 * Phase 1 of the promotions RFC — promotions CRUD is available to any active
 * vendor, even without Stripe onboarding, because the feature is dormant
 * (nothing is charged). When phase 2 wires this into checkout, a published
 * promotion will need an onboarded vendor.
 */
async function requireVendor() {
  const session = await getActionSession()
  if (!session || !isVendor(session.user.role)) redirect('/login')
  const vendor = await db.vendor.findUnique({ where: { userId: session.user.id } })
  if (!vendor) redirect('/login')
  return { session, vendor }
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const PROMOTION_KINDS = ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING'] as const
const PROMOTION_SCOPES = ['PRODUCT', 'VENDOR', 'CATEGORY'] as const

const promotionSchema = z
  .object({
    name: z.string().min(3, 'Mínimo 3 caracteres').max(100),
    code: z
      .string()
      .trim()
      .max(40)
      .regex(/^[A-Z0-9_-]*$/, 'Solo mayúsculas, números, guiones y guiones bajos')
      .optional()
      .nullable(),
    kind: z.enum(PROMOTION_KINDS),
    value: z.coerce.number().min(0),
    scope: z.enum(PROMOTION_SCOPES),
    productId: z.string().min(1).optional().nullable(),
    categoryId: z.string().min(1).optional().nullable(),
    minSubtotal: z.coerce.number().min(0).optional().nullable(),
    maxRedemptions: z.coerce.number().int().positive().max(1_000_000).optional().nullable(),
    perUserLimit: z.coerce.number().int().positive().max(1000).optional().nullable(),
    startsAt: z.string().datetime({ offset: true }).or(z.string().date()),
    endsAt: z.string().datetime({ offset: true }).or(z.string().date()),
  })
  .superRefine((data, ctx) => {
    // Scope ↔ target field
    if (data.scope === 'PRODUCT' && !data.productId) {
      ctx.addIssue({
        code: 'custom',
        path: ['productId'],
        message: 'Selecciona un producto',
      })
    }
    if (data.scope === 'CATEGORY' && !data.categoryId) {
      ctx.addIssue({
        code: 'custom',
        path: ['categoryId'],
        message: 'Selecciona una categoría',
      })
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
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'El porcentaje debe estar entre 0 y 100',
      })
    }
    if (data.kind === 'FIXED_AMOUNT' && data.value <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'El descuento debe ser mayor que 0',
      })
    }

    // Window
    const starts = new Date(data.startsAt).getTime()
    const ends = new Date(data.endsAt).getTime()
    if (Number.isNaN(starts) || Number.isNaN(ends)) {
      ctx.addIssue({
        code: 'custom',
        path: ['startsAt'],
        message: 'Fechas inválidas',
      })
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

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Creates a new promotion for the authenticated vendor. The promotion is
 * dormant until phase 2 of the RFC wires it into checkout — this endpoint
 * only persists the intent.
 */
export async function createPromotion(input: PromotionInput) {
  const { vendor } = await requireVendor()
  const data = promotionSchema.parse(input)

  // Normalize the code: empty string → null so the unique index is not tripped
  // by two NULL-ish codes colliding on the empty string.
  const code = data.code && data.code.length > 0 ? data.code.toUpperCase() : null

  if (code) {
    const existing = await db.promotion.findFirst({
      where: { vendorId: vendor.id, code },
      select: { id: true },
    })
    if (existing) {
      throw new Error('Ya tienes otra promoción con ese código')
    }
  }

  // Scope ownership: product/category must belong to the same vendor (product)
  // or exist at all (category — categories are global).
  if (data.scope === 'PRODUCT' && data.productId) {
    const product = await db.product.findFirst({
      where: { id: data.productId, vendorId: vendor.id, deletedAt: null },
      select: { id: true },
    })
    if (!product) throw new Error('Producto no encontrado')
  }
  if (data.scope === 'CATEGORY' && data.categoryId) {
    const category = await db.category.findUnique({
      where: { id: data.categoryId },
      select: { id: true },
    })
    if (!category) throw new Error('Categoría no encontrada')
  }

  const value =
    data.kind === 'FREE_SHIPPING' ? 0 : data.value

  const promotion = await db.promotion.create({
    data: {
      vendorId: vendor.id,
      name: data.name,
      code,
      kind: data.kind,
      value,
      scope: data.scope,
      productId: data.scope === 'PRODUCT' ? data.productId ?? null : null,
      categoryId: data.scope === 'CATEGORY' ? data.categoryId ?? null : null,
      minSubtotal: data.minSubtotal ?? null,
      maxRedemptions: data.maxRedemptions ?? null,
      perUserLimit: data.perUserLimit ?? 1,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
    },
  })

  safeRevalidatePath('/vendor/promociones')
  return promotion
}

/**
 * Lists the current vendor's promotions, optionally filtered by archived
 * state. Default: non-archived first, most recent first.
 */
export async function listMyPromotions(
  filter: 'active' | 'archived' | 'all' = 'active'
) {
  const { vendor } = await requireVendor()

  return db.promotion.findMany({
    where: {
      vendorId: vendor.id,
      ...(filter === 'active' && { archivedAt: null }),
      ...(filter === 'archived' && { archivedAt: { not: null } }),
    },
    orderBy: [{ archivedAt: 'asc' }, { createdAt: 'desc' }],
    include: {
      product: { select: { id: true, name: true, slug: true } },
      category: { select: { id: true, name: true, slug: true } },
    },
  })
}

export async function getMyPromotion(promotionId: string) {
  const { vendor } = await requireVendor()
  return db.promotion.findFirst({
    where: { id: promotionId, vendorId: vendor.id },
    include: {
      product: { select: { id: true, name: true, slug: true } },
      category: { select: { id: true, name: true, slug: true } },
    },
  })
}

/**
 * Archives a promotion — it stays in the DB so historical analytics work,
 * but disappears from the default vendor list and will not be considered by
 * checkout in phase 2.
 */
export async function archivePromotion(promotionId: string) {
  const { vendor } = await requireVendor()

  const promotion = await db.promotion.findFirst({
    where: { id: promotionId, vendorId: vendor.id },
    select: { id: true, archivedAt: true },
  })
  if (!promotion) throw new Error('Promoción no encontrada')
  if (promotion.archivedAt) return promotion

  const updated = await db.promotion.update({
    where: { id: promotionId },
    data: { archivedAt: new Date() },
  })

  safeRevalidatePath('/vendor/promociones')
  return updated
}

/**
 * Re-activates a previously archived promotion. The date window is NOT
 * touched — if the window already elapsed, the vendor needs to edit it
 * separately. (Edit is out of scope for phase 1 — archive + re-create is
 * the intended flow.)
 */
export async function unarchivePromotion(promotionId: string) {
  const { vendor } = await requireVendor()

  const promotion = await db.promotion.findFirst({
    where: { id: promotionId, vendorId: vendor.id },
    select: { id: true, archivedAt: true, code: true },
  })
  if (!promotion) throw new Error('Promoción no encontrada')
  if (!promotion.archivedAt) return promotion

  // Guard: another non-archived promotion may have claimed the same code
  // while this one was archived. Bail with a helpful error.
  if (promotion.code) {
    const clash = await db.promotion.findFirst({
      where: {
        vendorId: vendor.id,
        code: promotion.code,
        archivedAt: null,
        NOT: { id: promotionId },
      },
      select: { id: true },
    })
    if (clash) {
      throw new Error('Otra promoción activa ya usa ese código')
    }
  }

  const updated = await db.promotion.update({
    where: { id: promotionId },
    data: { archivedAt: null },
  })

  safeRevalidatePath('/vendor/promociones')
  return updated
}
