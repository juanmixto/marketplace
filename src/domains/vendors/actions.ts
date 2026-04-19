'use server'

import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { slugify } from '@/lib/utils'
import type { FulfillmentStatus } from '@/generated/prisma/enums'
import { parseExpirationDateInput } from '@/domains/catalog'
import { getActionSession } from '@/lib/action-session'
import { revalidateCatalogExperience, safeRevalidatePath } from '@/lib/revalidate'
import { isVendor } from '@/lib/roles'
import { isAllowedImageUrl } from '@/lib/image-validation'
// eslint-disable-next-line no-restricted-imports -- Telegram bootstrap is server-only and intentionally excluded from the notifications barrel
import { ensureTelegramHandlersRegistered } from '@/domains/notifications/telegram/ensure-registered'
// eslint-disable-next-line no-restricted-imports -- Web-push bootstrap mirrors the Telegram one; same reason
import { ensureWebPushHandlersRegistered } from '@/domains/notifications/web-push/ensure-registered'

/**
 * Dynamic dispatcher loader. The static import would close a
 * `vendors → notifications → vendors` domain cycle (notifications/
 * telegram/actions/*.ts calls back into this module), so we defer
 * the import. Call as `void emitNotification(...)` — handlers are
 * fire-and-forget, queueMicrotask'd by the dispatcher itself.
 */
async function emitNotification<E extends string>(
  event: E,
  payload: unknown,
): Promise<void> {
  const mod = await import('@/domains/notifications/dispatcher')
  ;(mod.emit as (e: E, p: unknown) => void)(event, payload)
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/**
 * Loads the vendor associated with the current session. Redirects to /login
 * if the user is not authenticated or not a vendor. Stripe onboarding is
 * required only for going live (admin approval); vendors can author drafts
 * and submit for review before completing it.
 */
async function requireVendor() {
  const session = await getActionSession()
  if (!session || !isVendor(session.user.role)) redirect('/login')
  const vendor = await db.vendor.findUnique({ where: { userId: session.user.id } })
  if (!vendor) redirect('/login')
  return { session, vendor }
}

// ─── Product schemas ──────────────────────────────────────────────────────────

import { productSchema, type ProductInput } from '@/shared/types/products'

ensureTelegramHandlersRegistered()
ensureWebPushHandlersRegistered()

// ─── CRUD productos ───────────────────────────────────────────────────────────

/**
 * Creates a new product for the authenticated vendor.
 * Status defaults to DRAFT. Vendor must submit for review explicitly.
 */
export async function createProduct(input: ProductInput) {
  const { vendor } = await requireVendor()

  const data = productSchema.parse(input)

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

  const previousBasePriceCents = Math.round(Number(product.basePrice) * 100)

  const updated = await db.product.update({
    where: { id: productId },
    data: {
      ...data,
      ...(data.expiresAt !== undefined && { expiresAt: parseExpirationDateInput(data.expiresAt) }),
      // Reset rejection note when re-editing a rejected product
      ...(product.status === 'REJECTED' && { rejectionNote: null }),
    },
  })

  // Price-drop fanout: only when the new basePrice is strictly lower
  // than the previous one. Small drifting changes still fire, but the
  // handler enforces a 24h per-product cooldown to keep the signal
  // meaningful.
  const newBasePriceCents = Math.round(Number(updated.basePrice) * 100)
  if (newBasePriceCents > 0 && newBasePriceCents < previousBasePriceCents) {
    emitNotification('favorite.price_drop', {
      productId: updated.id,
      productName: updated.name,
      productSlug: updated.slug,
      vendorName: vendor.displayName,
      oldPriceCents: previousBasePriceCents,
      newPriceCents: newBasePriceCents,
      currency: 'EUR',
    })
  }

  safeRevalidatePath('/vendor/productos')
  safeRevalidatePath(`/productos/${product.slug}`)
  revalidateCatalogExperience({ productSlug: updated.slug, vendorSlug: vendor.slug })
  return updated
}

// ─── Variant sync ─────────────────────────────────────────────────────────────

const variantInputSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(1, 'Nombre requerido').max(60, 'Máximo 60 caracteres'),
  priceModifier: z.coerce.number().min(-10_000).max(10_000),
  stock: z.coerce.number().int().min(0).max(1_000_000),
  isActive: z.coerce.boolean(),
})

const syncVariantsSchema = z.object({
  productId: z.string().min(1),
  variants: z.array(variantInputSchema).max(50, 'Máximo 50 variantes por producto'),
})

export type VariantInput = z.infer<typeof variantInputSchema>

/**
 * Full diff-sync of a product's variants: updates existing rows by id,
 * creates rows with no id, and removes rows that vanished from the
 * payload. A variant cannot be hard-deleted if it is referenced by an
 * order line or a cart item — in that case we soft-delete by flipping
 * `isActive=false` so historical data keeps resolving.
 */
export async function updateProductVariants(input: z.infer<typeof syncVariantsSchema>) {
  const { vendor } = await requireVendor()
  const { productId, variants } = syncVariantsSchema.parse(input)

  const product = await db.product.findFirst({
    where: { id: productId, vendorId: vendor.id, deletedAt: null },
    include: { variants: true },
  })
  if (!product) throw new Error('Producto no encontrado')

  const incomingIds = new Set(variants.map(v => v.id).filter((x): x is string => Boolean(x)))
  const toDelete = product.variants.filter(v => !incomingIds.has(v.id))

  // Track restock transitions *before* the transaction so we know which
  // variants just came back from zero — buyers who favourited the parent
  // product care about the product-level event, not per-variant.
  const previousVariantStock = new Map(
    product.variants.map(v => [v.id, { stock: v.stock, isActive: v.isActive }]),
  )
  let hadRestockTransition = false
  for (const v of variants) {
    if (!v.isActive || v.stock <= 0) continue
    if (!v.id) {
      // New active variant with stock > 0 is itself a restock signal.
      hadRestockTransition = true
      continue
    }
    const prev = previousVariantStock.get(v.id)
    if (!prev) continue
    const wasOutOfStock = !prev.isActive || prev.stock <= 0
    if (wasOutOfStock) {
      hadRestockTransition = true
    }
  }

  await db.$transaction(async tx => {
    for (const v of variants) {
      if (v.id) {
        const exists = product.variants.some(existing => existing.id === v.id)
        if (!exists) continue
        await tx.productVariant.update({
          where: { id: v.id },
          data: {
            name: v.name,
            priceModifier: v.priceModifier,
            stock: v.stock,
            isActive: v.isActive,
          },
        })
      } else {
        const sku = `${product.slug.slice(0, 20)}-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`
        await tx.productVariant.create({
          data: {
            productId: product.id,
            sku,
            name: v.name,
            priceModifier: v.priceModifier,
            stock: v.stock,
            isActive: v.isActive,
          },
        })
      }
    }

    for (const v of toDelete) {
      const [orderLines, cartItems] = await Promise.all([
        tx.orderLine.count({ where: { variantId: v.id } }),
        tx.cartItem.count({ where: { variantId: v.id } }),
      ])
      if (orderLines > 0 || cartItems > 0) {
        await tx.productVariant.update({
          where: { id: v.id },
          data: { isActive: false },
        })
      } else {
        await tx.productVariant.delete({ where: { id: v.id } })
      }
    }
  })

  if (hadRestockTransition) {
    emitNotification('favorite.back_in_stock', {
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      vendorName: vendor.displayName,
    })
  }

  safeRevalidatePath('/vendor/productos')
  safeRevalidatePath(`/productos/${product.slug}`)
  revalidateCatalogExperience({ productSlug: product.slug, vendorSlug: vendor.slug })
}

/**
 * Sets the stock of a product to an absolute value without going through
 * review. Rejected for products with active variants (stock lives on the
 * variant in that case — the vendor must edit variants explicitly).
 */
const stockSetSchema = z.object({
  productId: z.string().min(1),
  stock: z.number().int().min(0).max(1_000_000),
})

export async function setProductStock(input: z.infer<typeof stockSetSchema>) {
  const { vendor } = await requireVendor()
  const { productId, stock } = stockSetSchema.parse(input)

  const product = await db.product.findFirst({
    where: { id: productId, vendorId: vendor.id, deletedAt: null },
    include: { variants: { where: { isActive: true }, select: { id: true } } },
  })
  if (!product) throw new Error('Producto no encontrado')
  if (!product.trackStock) throw new Error('Este producto no trackea stock')
  if (product.variants.length > 0) {
    throw new Error('Productos con variantes: edita el stock por variante')
  }

  const previousStock = product.stock
  const updated = await db.product.update({
    where: { id: productId },
    data: { stock },
    select: { id: true, stock: true, slug: true, name: true },
  })

  // Fire the back-in-stock fanout exactly on the 0 → positive transition.
  // Any other change (top-up while already in stock, drop to zero) is a
  // non-event from the buyer's point of view.
  if (previousStock <= 0 && stock > 0) {
    emitNotification('favorite.back_in_stock', {
      productId: updated.id,
      productName: updated.name,
      productSlug: updated.slug,
      vendorName: vendor.displayName,
    })
  }

  safeRevalidatePath('/vendor/productos')
  safeRevalidatePath(`/productos/${product.slug}`)
  revalidateCatalogExperience({ productSlug: product.slug, vendorSlug: vendor.slug })
  return { id: updated.id, stock: updated.stock }
}

/**
 * Submits a draft product for admin review.
 */
export async function submitForReview(productId: string) {
  const { vendor } = await requireVendor()

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

// Manual advance path for vendors who do NOT use the Sendcloud automation:
// PENDING → CONFIRMED → PREPARING → READY → SHIPPED. The Sendcloud branch
// (CONFIRMED → LABEL_REQUESTED → READY | LABEL_FAILED) is driven by webhooks
// and lives in the shipping domain, not here. LABEL_FAILED falls back to
// manual so the vendor can print their own label and mark the order READY.
const VALID_TRANSITIONS: Partial<Record<FulfillmentStatus, FulfillmentStatus>> = {
  PENDING: 'CONFIRMED',
  CONFIRMED: 'PREPARING',
  PREPARING: 'READY',
  LABEL_FAILED: 'READY',
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

  // #570 — notify the buyer that a parcel is on the way. First live
  // push event in the app. Fire-and-forget so a broken push provider
  // never blocks the vendor's UI. sendPushToUser is already a no-op
  // when VAPID is unconfigured or the buyer has no subscription.
  if (nextStatus === 'SHIPPED') {
    void notifyBuyerFulfillmentShipped(fulfillment.orderId, {
      trackingNumber: trackingNumber ?? null,
    }).catch(() => {
      /* logged inside the helper — ignore here so the outer UI is unaffected */
    })
  }

  safeRevalidatePath('/vendor/pedidos')
}

async function notifyBuyerFulfillmentShipped(
  orderId: string,
  extras: { trackingNumber: string | null },
) {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, orderNumber: true },
    })
    if (!order) return
    const { sendPushToUser } = await import('@/lib/pwa/push-send')
    await sendPushToUser(order.customerId, {
      title: '📦 Tu pedido va en camino',
      body: extras.trackingNumber
        ? `Pedido ${order.orderNumber} · tracking ${extras.trackingNumber}`
        : `Pedido ${order.orderNumber} enviado. Toca para ver el seguimiento.`,
      url: `/cuenta/pedidos/${orderId}`,
      tag: `order-shipped-${orderId}`,
    })
  } catch (err) {
    const { logger } = await import('@/lib/logger')
    logger.warn('push.notify.fulfillment_shipped.failed', { orderId, err })
  }
}

/**
 * Confirm a PENDING fulfillment on behalf of the vendor identified by userId
 * rather than a browser session. Used by out-of-band entrypoints (Telegram
 * webhook callbacks) where the caller has authenticated the vendor through
 * a different mechanism (a TelegramLink whose chatId mapped to this userId).
 *
 * Ownership is enforced by scoping the lookup to (id, vendor.userId). The
 * transition is PENDING → CONFIRMED; any other state is rejected so
 * double-taps on a stale Telegram message cannot advance further than the
 * FSM intended.
 */
export async function confirmFulfillmentByUserId(
  userId: string,
  fulfillmentId: string,
): Promise<
  | { ok: true; fulfillmentId: string }
  | { ok: false; code: 'NOT_FOUND' | 'INVALID_STATE'; message: string }
> {
  const fulfillment = await db.vendorFulfillment.findFirst({
    where: { id: fulfillmentId, vendor: { userId } },
    select: { id: true, status: true, orderId: true, vendorId: true },
  })
  if (!fulfillment) {
    return { ok: false, code: 'NOT_FOUND', message: 'Fulfillment no encontrado' }
  }
  if (fulfillment.status !== 'PENDING') {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: `No se puede confirmar desde el estado ${fulfillment.status}`,
    }
  }

  await db.vendorFulfillment.update({
    where: { id: fulfillmentId },
    data: { status: 'CONFIRMED' },
  })
  // Out-of-band (Telegram) confirm leaves the vendor outside the app, so
  // nudge them with the next action — generate the shipping label.
  emitNotification('order.pending', {
    orderId: fulfillment.orderId,
    vendorId: fulfillment.vendorId,
    fulfillmentId: fulfillment.id,
    reason: 'NEEDS_LABEL',
  })
  safeRevalidatePath('/vendor/pedidos')
  return { ok: true, fulfillmentId }
}

/**
 * Mark a READY fulfillment as SHIPPED on behalf of the vendor identified by
 * userId rather than a browser session. Mirrors confirmFulfillmentByUserId
 * for out-of-band entrypoints (Telegram webhook callbacks).
 *
 * Only READY → SHIPPED is allowed — any other state is rejected so stale
 * Telegram buttons cannot move the FSM backwards or skip states. The
 * parent order status is recomputed in the same transaction as
 * advanceFulfillment does.
 */
export async function markShippedByUserId(
  userId: string,
  fulfillmentId: string,
): Promise<
  | { ok: true; fulfillmentId: string }
  | { ok: false; code: 'NOT_FOUND' | 'INVALID_STATE'; message: string }
> {
  const fulfillment = await db.vendorFulfillment.findFirst({
    where: { id: fulfillmentId, vendor: { userId } },
    select: { id: true, status: true, orderId: true, vendorId: true },
  })
  if (!fulfillment) {
    return { ok: false, code: 'NOT_FOUND', message: 'Fulfillment no encontrado' }
  }
  if (fulfillment.status !== 'READY') {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: `No se puede marcar como enviado desde el estado ${fulfillment.status}`,
    }
  }

  await db.$transaction(async tx => {
    await tx.vendorFulfillment.update({
      where: { id: fulfillmentId },
      data: { status: 'SHIPPED', shippedAt: new Date() },
    })

    const siblings = await tx.vendorFulfillment.findMany({
      where: { orderId: fulfillment.orderId },
      select: { status: true },
    })
    const allShipped = siblings.every(f => f.status === 'SHIPPED')
    await tx.order.update({
      where: { id: fulfillment.orderId },
      data: { status: allShipped ? 'SHIPPED' : 'PARTIALLY_SHIPPED' },
    })
  })

  // Notify the buyer that their order is on its way. The alternative
  // emission site — `shipping/transitions.ts` — fires when the Shipment
  // entity reaches IN_TRANSIT, but the vendor "Marcar enviado" flow
  // (both the portal button and the Telegram callback) transitions the
  // VendorFulfillment without advancing the Shipment, so without this
  // emission the buyer never gets the "📦 ya está en camino" ping.
  const [order, vendor] = await Promise.all([
    db.order.findUnique({
      where: { id: fulfillment.orderId },
      select: { customerId: true, orderNumber: true },
    }),
    db.vendor.findUnique({
      where: { id: fulfillment.vendorId },
      select: { displayName: true },
    }),
  ])
  if (order) {
    void emitNotification('order.status_changed', {
      orderId: fulfillment.orderId,
      customerUserId: order.customerId,
      fulfillmentId,
      status: 'SHIPPED',
      orderNumber: order.orderNumber,
      vendorName: vendor?.displayName ?? undefined,
    })
  }

  safeRevalidatePath('/vendor/pedidos')
  return { ok: true, fulfillmentId }
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
      shipment: {
        select: {
          id: true,
          status: true,
          labelUrl: true,
          trackingUrl: true,
          trackingNumber: true,
          carrierName: true,
        },
      },
      order: {
        include: {
          lines: {
            where: { vendorId: vendor.id },
            include: { product: { select: { name: true, images: true, unit: true, slug: true } } },
          },
          customer: { select: { firstName: true, lastName: true } },
          address: true,
        },
      },
    },
  })
}

export async function getMyFulfillmentByOrderId(orderId: string) {
  const { vendor } = await requireVendor()

  return db.vendorFulfillment.findFirst({
    where: {
      vendorId: vendor.id,
      orderId,
    },
    include: {
      shipment: {
        select: {
          id: true,
          status: true,
          labelUrl: true,
          trackingUrl: true,
          trackingNumber: true,
          carrierName: true,
        },
      },
      order: {
        include: {
          lines: {
            where: { vendorId: vendor.id },
            include: { product: { select: { name: true, images: true, unit: true, slug: true } } },
          },
          customer: { select: { firstName: true, lastName: true } },
          address: true,
        },
      },
    },
  })
}

// ─── Perfil vendor ────────────────────────────────────────────────────────────

const VENDOR_CATEGORY_VALUES = [
  'BAKERY',
  'CHEESE',
  'WINERY',
  'ORCHARD',
  'OLIVE_OIL',
  'FARM',
  'DRYLAND',
  'LOCAL_PRODUCER',
] as const

const profileSchema = z.object({
  displayName: z.string().min(3).max(80),
  description: z.string().max(2000).optional(),
  location: z.string().max(100).optional(),
  category: z
    .union([z.enum(VENDOR_CATEGORY_VALUES), z.literal(''), z.null()])
    .optional()
    .transform(v => (v == null || v === '' ? null : v)),
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

export async function updateVendorProfile(input: z.input<typeof profileSchema>) {
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
