'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuditRequestIp, mutateWithAudit } from '@/lib/audit'
import { requireCatalogAdmin, requireSuperadmin } from '@/lib/auth-guard'
import { revalidateCatalogExperience, safeRevalidatePath } from '@/lib/revalidate'
import { parseExpirationDateInput } from '@/domains/catalog'

// ─── Snapshots ────────────────────────────────────────────────────────────────

function productSnapshot(p: {
  id: string
  name: string
  slug: string
  status: string
  stock: number
  vendorId: string
  categoryId: string | null
  basePrice: { toString(): string } | number
  compareAtPrice: { toString(): string } | number | null
  taxRate: { toString(): string } | number
  unit: string
  trackStock: boolean
  description: string | null
  originRegion: string | null
  rejectionNote: string | null
}) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    status: p.status,
    stock: p.stock,
    vendorId: p.vendorId,
    categoryId: p.categoryId,
    basePrice: Number(p.basePrice),
    compareAtPrice: p.compareAtPrice == null ? null : Number(p.compareAtPrice),
    taxRate: Number(p.taxRate),
    unit: p.unit,
    trackStock: p.trackStock,
    description: p.description,
    originRegion: p.originRegion,
    rejectionNote: p.rejectionNote,
  }
}

function vendorSnapshot(v: {
  id: string
  status: string
  displayName: string
  slug: string
  description: string | null
  location: string | null
  category: string | null
  commissionRate: { toString(): string } | number
}) {
  return {
    id: v.id,
    status: v.status,
    displayName: v.displayName,
    slug: v.slug,
    description: v.description,
    location: v.location,
    category: v.category,
    commissionRate: Number(v.commissionRate),
  }
}

function promotionSnapshot(p: {
  id: string
  vendorId: string
  name: string
  code: string | null
  kind: string
  value: { toString(): string } | number
  scope: string
  productId: string | null
  categoryId: string | null
  minSubtotal: { toString(): string } | number | null
  maxRedemptions: number | null
  perUserLimit: number | null
  startsAt: Date
  endsAt: Date
  archivedAt: Date | null
}) {
  return {
    id: p.id,
    vendorId: p.vendorId,
    name: p.name,
    code: p.code,
    kind: p.kind,
    value: Number(p.value),
    scope: p.scope,
    productId: p.productId,
    categoryId: p.categoryId,
    minSubtotal: p.minSubtotal == null ? null : Number(p.minSubtotal),
    maxRedemptions: p.maxRedemptions,
    perUserLimit: p.perUserLimit,
    startsAt: p.startsAt.toISOString(),
    endsAt: p.endsAt.toISOString(),
    archivedAt: p.archivedAt?.toISOString() ?? null,
  }
}

function planSnapshot(p: {
  id: string
  vendorId: string
  productId: string
  cadence: string
  priceSnapshot: { toString(): string } | number
  taxRateSnapshot: { toString(): string } | number
  cutoffDayOfWeek: number
  archivedAt: Date | null
}) {
  return {
    id: p.id,
    vendorId: p.vendorId,
    productId: p.productId,
    cadence: p.cadence,
    priceSnapshot: Number(p.priceSnapshot),
    taxRateSnapshot: Number(p.taxRateSnapshot),
    cutoffDayOfWeek: p.cutoffDayOfWeek,
    archivedAt: p.archivedAt?.toISOString() ?? null,
  }
}

// ─── Products ─────────────────────────────────────────────────────────────────

const PRODUCT_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'REJECTED'] as const

const adminProductSchema = z.object({
  name: z.string().trim().min(3).max(100),
  description: z.string().trim().max(2000).optional().nullable(),
  categoryId: z.string().trim().optional().nullable(),
  basePrice: z.coerce.number().positive().max(100_000),
  compareAtPrice: z.coerce.number().positive().max(100_000).optional().nullable(),
  taxRate: z.coerce.number().refine(v => [0.04, 0.10, 0.21].includes(v), 'IVA inválido'),
  unit: z.string().trim().min(1).max(20),
  stock: z.coerce.number().int().min(0).max(1_000_000),
  trackStock: z.coerce.boolean(),
  status: z.enum(PRODUCT_STATUSES),
  originRegion: z.string().trim().max(100).optional().nullable(),
  rejectionNote: z.string().trim().max(500).optional().nullable(),
  expiresAt: z.string().trim().optional().nullable(),
})

export type AdminProductInput = z.infer<typeof adminProductSchema>

/**
 * Admin edit of a product. Bypasses vendor ownership — catalog admins and
 * superadmins can edit any vendor's product. Every change is audited.
 */
export async function adminUpdateProduct(productId: string, input: AdminProductInput) {
  const session = await requireCatalogAdmin()
  const data = adminProductSchema.parse(input)

  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product) throw new Error('Producto no encontrado')

  const before = productSnapshot(product)
  const ip = await getAuditRequestIp()

  const updated = await mutateWithAudit(async tx => {
    const updatedProduct = await tx.product.update({
      where: { id: productId },
      data: {
        name: data.name,
        description: data.description ?? null,
        categoryId: data.categoryId && data.categoryId.length > 0 ? data.categoryId : null,
        basePrice: data.basePrice,
        compareAtPrice: data.compareAtPrice ?? null,
        taxRate: data.taxRate,
        unit: data.unit,
        stock: data.stock,
        trackStock: data.trackStock,
        status: data.status,
        originRegion: data.originRegion ?? null,
        rejectionNote: data.rejectionNote ?? null,
        expiresAt: parseExpirationDateInput(data.expiresAt),
      },
    })
    return {
      result: updatedProduct,
      audit: {
        action: 'PRODUCT_EDITED',
        entityType: 'Product',
        entityId: productId,
        before,
        after: productSnapshot(updatedProduct),
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  safeRevalidatePath('/admin/productos')
  safeRevalidatePath(`/admin/productos/${productId}/edit`)
  safeRevalidatePath('/admin/auditoria')
  safeRevalidatePath('/vendor/productos')
  revalidateCatalogExperience({ productSlug: updated.slug })
}

// ─── Vendors (producers) ──────────────────────────────────────────────────────

const VENDOR_STATUSES = [
  'APPLYING',
  'PENDING_DOCS',
  'ACTIVE',
  'SUSPENDED_TEMP',
  'SUSPENDED_PERM',
  'REJECTED',
] as const

const VENDOR_CATEGORIES = [
  'BAKERY',
  'CHEESE',
  'WINERY',
  'ORCHARD',
  'OLIVE_OIL',
  'FARM',
  'DRYLAND',
  'LOCAL_PRODUCER',
] as const

const adminVendorSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9-]+$/, 'slug inválido'),
  description: z.string().trim().max(2000).optional().nullable(),
  location: z.string().trim().max(100).optional().nullable(),
  category: z.enum(VENDOR_CATEGORIES).optional().nullable(),
  status: z.enum(VENDOR_STATUSES),
  commissionRate: z.coerce.number().min(0).max(1),
})

export type AdminVendorInput = z.infer<typeof adminVendorSchema>

/**
 * Admin edit of a vendor (producer). Status and commissionRate have financial
 * implications, so this action requires SUPERADMIN.
 */
export async function adminUpdateVendor(vendorId: string, input: AdminVendorInput) {
  const session = await requireSuperadmin()
  const data = adminVendorSchema.parse(input)

  const vendor = await db.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor) throw new Error('Productor no encontrado')

  if (data.slug !== vendor.slug) {
    const clash = await db.vendor.findFirst({
      where: { slug: data.slug, NOT: { id: vendorId } },
      select: { id: true },
    })
    if (clash) throw new Error('Ese slug ya está en uso')
  }

  const before = vendorSnapshot(vendor)
  const ip = await getAuditRequestIp()

  const updated = await mutateWithAudit(async tx => {
    const updatedVendor = await tx.vendor.update({
      where: { id: vendorId },
      data: {
        displayName: data.displayName,
        slug: data.slug,
        description: data.description ?? null,
        location: data.location ?? null,
        category: data.category ?? null,
        status: data.status,
        commissionRate: data.commissionRate,
      },
    })
    return {
      result: updatedVendor,
      audit: {
        action: 'VENDOR_EDITED',
        entityType: 'Vendor',
        entityId: vendorId,
        before,
        after: vendorSnapshot(updatedVendor),
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  safeRevalidatePath('/admin/productores')
  safeRevalidatePath(`/admin/productores/${vendorId}/edit`)
  safeRevalidatePath('/admin/auditoria')
  safeRevalidatePath(`/productores/${updated.slug}`)
}

// ─── Promotions ───────────────────────────────────────────────────────────────

const PROMOTION_KINDS = ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING'] as const
const PROMOTION_SCOPES = ['PRODUCT', 'VENDOR', 'CATEGORY'] as const

const adminPromotionSchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    code: z.string().trim().max(40).regex(/^[A-Z0-9_-]*$/i).optional().nullable(),
    kind: z.enum(PROMOTION_KINDS),
    value: z.coerce.number().min(0).max(100_000),
    scope: z.enum(PROMOTION_SCOPES),
    productId: z.string().trim().optional().nullable(),
    categoryId: z.string().trim().optional().nullable(),
    minSubtotal: z.coerce.number().min(0).max(100_000).optional().nullable(),
    maxRedemptions: z.coerce.number().int().positive().max(1_000_000).optional().nullable(),
    perUserLimit: z.coerce.number().int().positive().max(1000).optional().nullable(),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    if (data.scope === 'PRODUCT' && !data.productId) {
      ctx.addIssue({ code: 'custom', path: ['productId'], message: 'Selecciona un producto' })
    }
    if (data.scope === 'CATEGORY' && !data.categoryId) {
      ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Selecciona una categoría' })
    }
    if (data.kind === 'PERCENTAGE' && (data.value <= 0 || data.value > 100)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'El porcentaje debe estar entre 0 y 100' })
    }
    const starts = new Date(data.startsAt).getTime()
    const ends = new Date(data.endsAt).getTime()
    if (Number.isNaN(starts) || Number.isNaN(ends) || ends <= starts) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Rango de fechas inválido' })
    }
  })

export type AdminPromotionInput = z.infer<typeof adminPromotionSchema>

/**
 * Admin edit of a promotion. Works on any vendor's promotion. Archived
 * promotions can still be edited by admin (vendors must un-archive first,
 * admins can override).
 */
export async function adminUpdatePromotion(promotionId: string, input: AdminPromotionInput) {
  const session = await requireCatalogAdmin()
  const data = adminPromotionSchema.parse(input)

  const current = await db.promotion.findUnique({ where: { id: promotionId } })
  if (!current) throw new Error('Promoción no encontrada')

  const code = data.code && data.code.length > 0 ? data.code.toUpperCase() : null

  if (code) {
    const clash = await db.promotion.findFirst({
      where: { vendorId: current.vendorId, code, NOT: { id: promotionId } },
      select: { id: true },
    })
    if (clash) throw new Error('Ya existe otra promoción con ese código para este productor')
  }

  if (data.scope === 'PRODUCT' && data.productId) {
    const product = await db.product.findFirst({
      where: { id: data.productId, vendorId: current.vendorId, deletedAt: null },
      select: { id: true },
    })
    if (!product) throw new Error('Producto no encontrado para este productor')
  }
  if (data.scope === 'CATEGORY' && data.categoryId) {
    const category = await db.category.findUnique({
      where: { id: data.categoryId },
      select: { id: true },
    })
    if (!category) throw new Error('Categoría no encontrada')
  }

  const value = data.kind === 'FREE_SHIPPING' ? 0 : data.value

  const before = promotionSnapshot(current)
  const ip = await getAuditRequestIp()

  await mutateWithAudit(async tx => {
    const updated = await tx.promotion.update({
      where: { id: promotionId },
      data: {
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
    return {
      result: updated,
      audit: {
        action: 'PROMOTION_EDITED',
        entityType: 'Promotion',
        entityId: promotionId,
        before,
        after: promotionSnapshot(updated),
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  safeRevalidatePath('/admin/promociones')
  safeRevalidatePath(`/admin/promociones/${promotionId}/edit`)
  safeRevalidatePath('/admin/auditoria')
  safeRevalidatePath('/vendor/promociones')
}

// ─── Subscription plans ───────────────────────────────────────────────────────

const SUBSCRIPTION_CADENCES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const

const adminPlanSchema = z.object({
  cadence: z.enum(SUBSCRIPTION_CADENCES),
  priceSnapshot: z.coerce.number().positive().max(100_000),
  taxRateSnapshot: z.coerce.number().refine(v => [0.04, 0.10, 0.21].includes(v), 'IVA inválido'),
  cutoffDayOfWeek: z.coerce.number().int().min(0).max(6),
  archived: z.coerce.boolean().default(false),
})

export type AdminSubscriptionPlanInput = z.infer<typeof adminPlanSchema>

/**
 * Admin edit of a subscription plan. Price changes only apply to NEW
 * renewals — existing Stripe subscriptions keep the price they were
 * originally charged at (Stripe holds the recurring price on the
 * subscription itself). Changing the price here rewrites the plan's
 * snapshot so future Subscription rows pick it up on creation.
 */
export async function adminUpdateSubscriptionPlan(planId: string, input: AdminSubscriptionPlanInput) {
  const session = await requireSuperadmin()
  const data = adminPlanSchema.parse(input)

  const plan = await db.subscriptionPlan.findUnique({ where: { id: planId } })
  if (!plan) throw new Error('Plan no encontrado')

  const before = planSnapshot(plan)
  const ip = await getAuditRequestIp()

  await mutateWithAudit(async tx => {
    const updated = await tx.subscriptionPlan.update({
      where: { id: planId },
      data: {
        cadence: data.cadence,
        priceSnapshot: data.priceSnapshot,
        taxRateSnapshot: data.taxRateSnapshot,
        cutoffDayOfWeek: data.cutoffDayOfWeek,
        archivedAt: data.archived ? (plan.archivedAt ?? new Date()) : null,
      },
    })
    return {
      result: updated,
      audit: {
        action: 'SUBSCRIPTION_PLAN_EDITED',
        entityType: 'SubscriptionPlan',
        entityId: planId,
        before,
        after: planSnapshot(updated),
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  safeRevalidatePath('/admin/suscripciones')
  safeRevalidatePath(`/admin/suscripciones/${planId}/edit`)
  safeRevalidatePath('/admin/auditoria')
  safeRevalidatePath('/vendor/suscripciones')
}

