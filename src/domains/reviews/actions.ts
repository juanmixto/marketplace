'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { isVendor } from '@/lib/roles'
import { redirect } from 'next/navigation'
import { safeRevalidatePath } from '@/lib/revalidate'
// eslint-disable-next-line no-restricted-imports -- dispatcher is intentionally server-only, excluded from notifications barrel
import { emit as emitNotification } from '@/domains/notifications/dispatcher'

const createReviewSchema = z.object({
  orderId: z.string().min(1),
  productId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(1000).optional(),
})

export async function canLeaveReview(orderId: string, productId: string) {
  const session = await getActionSession()
  if (!session) return false

  // The customer can leave a review when:
  // - they own a DELIVERED order with this product (capability),
  // - they have NOT yet reviewed this exact (order, product) pair, and
  // - they have NOT already reviewed this product in any prior order
  //   (soft-skip rule — see docs in pending.ts).
  const [order, reviewForThisOrder, anyPriorReview] = await Promise.all([
    db.order.findFirst({
      where: {
        id: orderId,
        customerId: session.user.id,
        status: 'DELIVERED',
        lines: { some: { productId } },
      },
      select: { id: true },
    }),
    db.review.findUnique({
      where: { orderId_productId: { orderId, productId } },
      select: { id: true },
    }),
    db.review.findFirst({
      where: { customerId: session.user.id, productId },
      select: { id: true },
    }),
  ])

  return Boolean(order) && !reviewForThisOrder && !anyPriorReview
}

export async function createReview(
  orderId: string,
  productId: string,
  rating: number,
  body?: string
) {
  const session = await getActionSession()
  if (!session) throw new Error('Debes iniciar sesión para dejar una reseña')

  const validated = createReviewSchema.parse({ orderId, productId, rating, body })
  const trimmedBody = validated.body?.trim()

  const order = await db.order.findFirst({
    where: {
      id: validated.orderId,
      customerId: session.user.id,
      status: 'DELIVERED',
      lines: { some: { productId: validated.productId } },
    },
    include: {
      lines: {
        where: { productId: validated.productId },
        select: { productId: true, vendorId: true },
      },
    },
  })

  if (!order) {
    throw new Error('Solo puedes reseñar productos de pedidos entregados')
  }

  const line = order.lines[0]
  if (!line) {
    throw new Error('Producto no encontrado en el pedido')
  }

  const [existingReview, anyPriorReview] = await Promise.all([
    db.review.findUnique({
      where: {
        orderId_productId: {
          orderId: validated.orderId,
          productId: validated.productId,
        },
      },
      select: { id: true },
    }),
    // Hard-disable cross-order duplication. The DB unique is (orderId,
    // productId), but we deliberately limit a buyer to one review per product
    // across their lifetime. This matches the soft-skip rule in the UI and
    // prevents abuse of the review system through repeat purchases.
    db.review.findFirst({
      where: { customerId: session.user.id, productId: validated.productId },
      select: { id: true },
    }),
  ])

  if (existingReview) {
    throw new Error('Ya has dejado una reseña para este producto en este pedido')
  }
  if (anyPriorReview) {
    throw new Error('Ya reseñaste este producto en otra compra. Solo se admite una reseña por producto.')
  }

  const [product, vendor] = await Promise.all([
    db.product.findUnique({
      where: { id: validated.productId },
      select: { slug: true, name: true },
    }),
    db.vendor.findUnique({
      where: { id: line.vendorId },
      select: { slug: true },
    }),
  ])

  const createdReview = await db.$transaction(async tx => {
    const review = await tx.review.create({
      data: {
        orderId: validated.orderId,
        productId: validated.productId,
        vendorId: line.vendorId,
        customerId: session.user.id,
        rating: validated.rating,
        body: trimmedBody || null,
      },
      select: { id: true },
    })

    const aggregate = await tx.review.aggregate({
      where: { vendorId: line.vendorId },
      _avg: { rating: true },
      _count: { _all: true },
    })

    await tx.vendor.update({
      where: { id: line.vendorId },
      data: {
        avgRating: aggregate._avg.rating ?? null,
        totalReviews: aggregate._count._all,
      },
    })
    return review
  })

  emitNotification('review.received', {
    reviewId: createdReview.id,
    vendorId: line.vendorId,
    productId: validated.productId,
    productName: product?.name ?? 'Producto',
    rating: validated.rating,
  })

  safeRevalidatePath(`/cuenta/pedidos/${validated.orderId}`)
  if (product?.slug) safeRevalidatePath(`/productos/${product.slug}`)
  if (vendor?.slug) safeRevalidatePath(`/productores/${vendor.slug}`)
}

const respondSchema = z.object({
  reviewId: z.string().min(1),
  response: z.string().trim().min(1, 'La respuesta no puede estar vacía').max(1000),
})

export async function respondToReview(input: z.infer<typeof respondSchema>) {
  const session = await getActionSession()
  if (!session || !isVendor(session.user.role)) redirect('/login')

  const vendor = await db.vendor.findUnique({
    where: { userId: session.user.id },
    select: { id: true, slug: true },
  })
  if (!vendor) redirect('/login')

  const data = respondSchema.parse(input)

  const review = await db.review.findUnique({
    where: { id: data.reviewId },
    select: { vendorId: true, product: { select: { slug: true } } },
  })
  if (!review || review.vendorId !== vendor.id) {
    throw new Error('No puedes responder a esta valoración')
  }

  await db.review.update({
    where: { id: data.reviewId },
    data: { vendorResponse: data.response, vendorResponseAt: new Date() },
  })

  safeRevalidatePath('/vendor/valoraciones')
  if (review.product?.slug) safeRevalidatePath(`/productos/${review.product.slug}`)
  safeRevalidatePath(`/productores/${vendor.slug}`)
}

export async function deleteReviewResponse(reviewId: string) {
  const session = await getActionSession()
  if (!session || !isVendor(session.user.role)) redirect('/login')

  const vendor = await db.vendor.findUnique({
    where: { userId: session.user.id },
    select: { id: true, slug: true },
  })
  if (!vendor) redirect('/login')

  const review = await db.review.findUnique({
    where: { id: reviewId },
    select: { vendorId: true, product: { select: { slug: true } } },
  })
  if (!review || review.vendorId !== vendor.id) {
    throw new Error('No puedes modificar esta valoración')
  }

  await db.review.update({
    where: { id: reviewId },
    data: { vendorResponse: null, vendorResponseAt: null },
  })

  safeRevalidatePath('/vendor/valoraciones')
  if (review.product?.slug) safeRevalidatePath(`/productos/${review.product.slug}`)
  safeRevalidatePath(`/productores/${vendor.slug}`)
}

export async function getProductReviews(productId: string) {
  const [reviews, aggregate] = await Promise.all([
    db.review.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        rating: true,
        body: true,
        createdAt: true,
        vendorResponse: true,
        vendorResponseAt: true,
        customer: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    }),
    db.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ])

  return {
    reviews,
    averageRating: aggregate._avg.rating ? Number(aggregate._avg.rating) : null,
    totalReviews: aggregate._count._all,
  }
}

// ─── #571 — trust + abuse controls ─────────────────────────────────

const reportReasonSchema = z.enum(['SPAM', 'OFFENSIVE', 'OFF_TOPIC', 'FAKE', 'OTHER'])
const reportTargetSchema = z.enum(['REVIEW_BODY', 'VENDOR_RESPONSE'])

const reportReviewSchema = z.object({
  reviewId: z.string().min(1),
  reason: reportReasonSchema,
  target: reportTargetSchema.default('REVIEW_BODY'),
  detail: z.string().trim().max(500).optional(),
})

export type ReportReviewInput = z.input<typeof reportReviewSchema>

/**
 * Flag a review (or a vendor response on it) for moderation (#571).
 *
 * - Any authenticated user can report. The vendor that OWNS the review
 *   cannot report their own content — they already have delete/respond
 *   controls.
 * - `reportReview` is idempotent at the (review, reporter, target)
 *   tuple: a second tap returns the existing row instead of throwing,
 *   so accidental double-clicks never produce a UX error.
 * - No write permissions on Review are changed. Moderators follow up
 *   out of band via an admin list (scripts/review-reports-list.ts) and
 *   either resolve the report or moderate the review with existing
 *   admin tooling.
 */
export async function reportReview(input: ReportReviewInput): Promise<{ id: string }> {
  const session = await getActionSession()
  if (!session) throw new Error('Debes iniciar sesión para reportar una reseña')

  const data = reportReviewSchema.parse(input)

  // Ownership: the buyer who wrote the review cannot report it
  // (useless), and a vendor cannot flag their own response.
  const review = await db.review.findUnique({
    where: { id: data.reviewId },
    select: { customerId: true, vendorId: true, vendorResponse: true },
  })
  if (!review) throw new Error('Reseña no encontrada')
  if (data.target === 'REVIEW_BODY' && review.customerId === session.user.id) {
    throw new Error('No puedes reportar tu propia reseña')
  }
  if (data.target === 'VENDOR_RESPONSE') {
    if (!review.vendorResponse) {
      throw new Error('Esta reseña no tiene respuesta del productor')
    }
    // The vendor that owns the review cannot flag their own response.
    const vendor = await db.vendor.findUnique({
      where: { id: review.vendorId },
      select: { userId: true },
    })
    if (vendor?.userId === session.user.id) {
      throw new Error('No puedes reportar tu propia respuesta')
    }
  }

  try {
    const row = await db.reviewReport.create({
      data: {
        reviewId: data.reviewId,
        reporterId: session.user.id,
        reason: data.reason,
        target: data.target,
        detail: data.detail ?? null,
      },
      select: { id: true },
    })
    return { id: row.id }
  } catch (err) {
    // Idempotent: if the same reporter flags the same target twice,
    // collapse into the existing row.
    if (err instanceof Error && /P2002|Unique constraint/i.test(err.message)) {
      const existing = await db.reviewReport.findUnique({
        where: {
          reviewId_reporterId_target: {
            reviewId: data.reviewId,
            reporterId: session.user.id,
            target: data.target,
          },
        },
        select: { id: true },
      })
      if (existing) return { id: existing.id }
    }
    throw err
  }
}
