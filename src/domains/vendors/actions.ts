'use server'

import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { slugify } from '@/lib/utils'
import type { FulfillmentStatus } from '@/generated/prisma/enums'
import { parseExpirationDateInput } from '@/domains/catalog/availability'
import { getActionSession } from '@/lib/action-session'
import { revalidateCatalogExperience, safeRevalidatePath } from '@/lib/revalidate'
import { isVendor } from '@/lib/roles'
import { assertVendorOnboarded } from '@/domains/vendors/onboarding'
import { isAllowedImageUrl } from '@/lib/image-validation'

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/**
 * Loads the vendor associated with the current session. Redirects to /login
 * if the user is not authenticated or not a vendor. Used by actions that do
 * NOT require Stripe onboarding (e.g. reading dashboards, editing the
 * vendor profile before completing onboarding).
 */
async function requireVendor() {
  const session = await getActionSession()
  if (!session || !isVendor(session.user.role)) redirect('/login')
  const vendor = await db.vendor.findUnique({ where: { userId: session.user.id } })
  if (!vendor) redirect('/login')
  return { session, vendor }
}

/**
 * Like requireVendor() but also enforces that the vendor has completed
 * Stripe Connect onboarding. Use for any action that creates products,
 * moves money, or otherwise requires a payout destination.
 */
async function requireOnboardedVendor() {
  const result = await requireVendor()
  assertVendorOnboarded(result.vendor)
  return result
}

// ─── Product schemas ──────────────────────────────────────────────────────────

const productSchema = z.object({
  name: z.string().min(3, 'Mínimo 3 caracteres').max(100),
  description: z.string().max(2000).optional(),
  categoryId: z.string().optional(),
  basePrice: z.coerce.number().positive('Precio debe ser positivo'),
  compareAtPrice: z.coerce.number().positive().optional().nullable(),
  taxRate: z.coerce.number().refine(v => [0.04, 0.10, 0.21].includes(v), 'IVA inválido'),
  unit: z.string().min(1).max(20),
  stock: z.coerce.number().int().min(0),
  trackStock: z.coerce.boolean(),
  certifications: z.array(z.string()).default([]),
  originRegion: z.string().max(100).optional(),
  images: z
    .array(z.string().refine(isAllowedImageUrl, 'URL de imagen no permitida'))
    .default([]),
  expiresAt: z.string().date().optional().nullable(),
  status: z.enum(['DRAFT', 'PENDING_REVIEW']).default('DRAFT'),
})

type ProductInput = z.infer<typeof productSchema>

// ─── CRUD productos ───────────────────────────────────────────────────────────

/**
 * Creates a new product for the authenticated vendor.
 * Status defaults to DRAFT. Vendor must submit for review explicitly.
 */
export async function createProduct(input: ProductInput) {
  const { vendor } = await requireVendor()

  const data = productSchema.parse(input)

  // Drafts can be saved without Stripe onboarding; only submitting for review
  // (or any non-draft status) requires a payout destination.
  if (data.status !== 'DRAFT') {
    assertVendorOnboarded(vendor)
  }

  // Generate unique slug
  let slug = slugify(data.name)
  const existing = await db.product.findUnique({ where: { slug } })
  if (existing) slug = `${slug}-${Date.now()}`

  const product = await db.product.create({
    data: {
      ...data,
      slug,
      vendorId: vendor.id,
      compareAtPrice: data.compareAtPrice ?? null,
      description: data.description ?? null,
      categoryId: data.categoryId ?? null,
      originRegion: data.originRegion ?? null,
      expiresAt: parseExpirationDateInput(data.expiresAt),
    },
  })

  safeRevalidatePath('/vendor/productos')
  revalidateCatalogExperience({ productSlug: product.slug, vendorSlug: vendor.slug })
  return product
}

/**
 * Updates a product. Only the owning vendor can update.
 * If product is ACTIVE and changes prices/stock, keeps status.
 * If product was REJECTED, moving to DRAFT resets rejectionNote.
 */
export async function updateProduct(productId: string, input: Partial<ProductInput>) {
  const { vendor } = await requireVendor()

  const product = await db.product.findFirst({
    where: { id: productId, vendorId: vendor.id },
  })
  if (!product) throw new Error('Producto no encontrado')

  const data = productSchema.partial().parse(input)

  if (data.status && data.status !== 'DRAFT') {
    assertVendorOnboarded(vendor)
  }

  const updated = await db.product.update({
    where: { id: productId },
    data: {
      ...data,
      ...(data.expiresAt !== undefined && { expiresAt: parseExpirationDateInput(data.expiresAt) }),
      // Reset rejection note when re-editing a rejected product
      ...(product.status === 'REJECTED' && { rejectionNote: null }),
    },
  })

  safeRevalidatePath('/vendor/productos')
  safeRevalidatePath(`/productos/${product.slug}`)
  revalidateCatalogExperience({ productSlug: updated.slug, vendorSlug: vendor.slug })
  return updated
}

/**
 * Adjusts the stock of a product by a delta without going through review.
 * Clamped at 0. Rejected for products with active variants (stock lives on
 * the variant in that case — the vendor must edit variants explicitly).
 */
const stockDeltaSchema = z.object({
  productId: z.string().min(1),
  delta: z.number().int().refine(v => v !== 0, 'Delta must be non-zero'),
})

export async function adjustProductStock(input: z.infer<typeof stockDeltaSchema>) {
  const { vendor } = await requireVendor()
  const { productId, delta } = stockDeltaSchema.parse(input)

  const product = await db.product.findFirst({
    where: { id: productId, vendorId: vendor.id, deletedAt: null },
    include: { variants: { where: { isActive: true }, select: { id: true } } },
  })
  if (!product) throw new Error('Producto no encontrado')
  if (!product.trackStock) throw new Error('Este producto no trackea stock')
  if (product.variants.length > 0) {
    throw new Error('Productos con variantes: edita el stock por variante')
  }

  const nextStock = Math.max(0, product.stock + delta)

  const updated = await db.product.update({
    where: { id: productId },
    data: { stock: nextStock },
    select: { id: true, stock: true, slug: true },
  })

  safeRevalidatePath('/vendor/productos')
  safeRevalidatePath(`/productos/${product.slug}`)
  revalidateCatalogExperience({ productSlug: product.slug, vendorSlug: vendor.slug })
  return { id: updated.id, stock: updated.stock }
}

/**
 * Submits a draft product for admin review.
 */
export async function submitForReview(productId: string) {
  const { vendor } = await requireOnboardedVendor()

  const product = await db.product.findFirst({
    where: { id: productId, vendorId: vendor.id, status: { in: ['DRAFT', 'REJECTED'] } },
  })
  if (!product) throw new Error('Producto no encontrado o no se puede enviar a revisión')

  await db.product.update({
    where: { id: productId },
    data: { status: 'PENDING_REVIEW', rejectionNote: null },
  })

  safeRevalidatePath('/vendor/productos')
  revalidateCatalogExperience({ productSlug: product.slug, vendorSlug: vendor.slug })
}

/**
 * Soft-deletes a product. Cannot delete if it has active orders.
 */
export async function deleteProduct(productId: string) {
  const { vendor } = await requireVendor()

  const product = await db.product.findFirst({
    where: { id: productId, vendorId: vendor.id, deletedAt: null },
  })
  if (!product) throw new Error('Producto no encontrado')

  const activeOrderLines = await db.orderLine.count({
    where: {
      productId,
      order: { status: { in: ['PLACED', 'PAYMENT_CONFIRMED', 'PROCESSING', 'SHIPPED'] } },
    },
  })
  if (activeOrderLines > 0) {
    throw new Error('No puedes eliminar un producto con pedidos activos')
  }

  await db.product.update({
    where: { id: productId },
    data: { deletedAt: new Date(), status: 'SUSPENDED' },
  })

  safeRevalidatePath('/vendor/productos')
  revalidateCatalogExperience({ productSlug: product.slug, vendorSlug: vendor.slug })
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getMyProducts() {
  const { vendor } = await requireVendor()
  return db.product.findMany({
    where: { vendorId: vendor.id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: {
      category: { select: { name: true } },
      variants: { where: { isActive: true }, select: { id: true } },
    },
  })
}

export async function getMyProduct(productId: string) {
  const { vendor } = await requireVendor()
  return db.product.findFirst({
    where: { id: productId, vendorId: vendor.id, deletedAt: null },
    include: { category: true, variants: true },
  })
}

// ─── Fulfillment (pedidos) ────────────────────────────────────────────────────

const VALID_TRANSITIONS: Partial<Record<FulfillmentStatus, FulfillmentStatus>> = {
  PENDING: 'CONFIRMED',
  CONFIRMED: 'PREPARING',
  PREPARING: 'READY',
  READY: 'SHIPPED',
}

/**
 * Advances a fulfillment to the next state.
 * Validates the transition is legal.
 */
export async function advanceFulfillment(
  fulfillmentId: string,
  trackingNumber?: string,
  carrier?: string
) {
  const { vendor } = await requireVendor()

  const fulfillment = await db.vendorFulfillment.findFirst({
    where: { id: fulfillmentId, vendorId: vendor.id },
  })
  if (!fulfillment) throw new Error('Fulfillment no encontrado')

  const nextStatus = VALID_TRANSITIONS[fulfillment.status]
  if (!nextStatus) throw new Error(`No se puede avanzar desde el estado ${fulfillment.status}`)

  await db.$transaction(async tx => {
    await tx.vendorFulfillment.update({
      where: { id: fulfillmentId },
      data: {
        status: nextStatus,
        ...(nextStatus === 'SHIPPED' && {
          trackingNumber: trackingNumber ?? null,
          carrier: carrier ?? null,
          shippedAt: new Date(),
        }),
      },
    })

    // When a fulfillment ships, recalculate the parent order status
    if (nextStatus === 'SHIPPED') {
      const allFulfillments = await tx.vendorFulfillment.findMany({
        where: { orderId: fulfillment.orderId },
        select: { status: true },
      })

      const allShipped = allFulfillments.every(f => f.status === 'SHIPPED')
      const newOrderStatus = allShipped ? 'SHIPPED' : 'PARTIALLY_SHIPPED'

      await tx.order.update({
        where: { id: fulfillment.orderId },
        data: { status: newOrderStatus },
      })
    }
  })

  safeRevalidatePath('/vendor/pedidos')
}

export async function getMyFulfillments(filter?: 'active' | 'urgent' | 'shipped' | 'all') {
  const { vendor } = await requireVendor()

  const statusMap: Record<'active' | 'urgent' | 'shipped' | 'all', FulfillmentStatus[] | undefined> = {
    active: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'],
    urgent: ['PENDING', 'READY'],
    shipped: ['SHIPPED', 'DELIVERED'],
    all: undefined,
  }

  const statuses = filter ? statusMap[filter] : undefined

  return db.vendorFulfillment.findMany({
    where: {
      vendorId: vendor.id,
      ...(statuses && { status: { in: statuses } }),
    },
    orderBy: { createdAt: 'asc' },
    include: {
      order: {
        include: {
          lines: {
            where: { vendorId: vendor.id },
            include: { product: { select: { name: true, images: true, unit: true } } },
          },
          customer: { select: { firstName: true, lastName: true } },
          address: true,
        },
      },
    },
  })
}

// ─── Perfil vendor ────────────────────────────────────────────────────────────

const profileSchema = z.object({
  displayName: z.string().min(3).max(80),
  description: z.string().max(2000).optional(),
  location: z.string().max(100).optional(),
  logo: z
    .union([z.string(), z.literal('')])
    .optional()
    .transform(v => (v ? v.trim() : null))
    .refine(v => v === null || isAllowedImageUrl(v), {
      message: 'Imagen no permitida. Súbela desde tu equipo o pega una URL permitida.',
    }),
  coverImage: z
    .union([z.string(), z.literal('')])
    .optional()
    .transform(v => (v ? v.trim() : null))
    .refine(v => v === null || isAllowedImageUrl(v), {
      message: 'Imagen no permitida. Súbela desde tu equipo o pega una URL permitida.',
    }),
  orderCutoffTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  preparationDays: z.coerce.number().int().min(0).max(30).optional(),
  iban: z.string().max(34).optional(),
  bankAccountName: z.string().max(100).optional(),
})

export async function updateVendorProfile(input: z.infer<typeof profileSchema>) {
  const { vendor } = await requireVendor()
  const data = profileSchema.parse(input)

  const updated = await db.vendor.update({
    where: { id: vendor.id },
    data,
  })

  safeRevalidatePath('/vendor/perfil')
  revalidateCatalogExperience({ vendorSlug: vendor.slug })
  return updated
}

export async function getMyVendorProfile() {
  const { vendor } = await requireVendor()
  return vendor
}
