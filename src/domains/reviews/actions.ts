'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { isVendor } from '@/lib/roles'
import { redirect } from 'next/navigation'
import { safeRevalidatePath } from '@/lib/revalidate'

const createReviewSchema = z.object({
  orderId: z.string().min(1),
  productId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(1000).optional(),
})

export async function canLeaveReview(orderId: string, productId: string) {
  const session = await getActionSession()
  if (!session) return false

  const [order, existingReview] = await Promise.all([
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
  ])

  return Boolean(order) && !existingReview
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

  const existingReview = await db.review.findUnique({
    where: {
      orderId_productId: {
        orderId: validated.orderId,
        productId: validated.productId,
      },
    },
    select: { id: true },
  })

  if (existingReview) {
    throw new Error('Ya has dejado una reseña para este producto en este pedido')
  }

  const [product, vendor] = await Promise.all([
    db.product.findUnique({
      where: { id: validated.productId },
      select: { slug: true },
    }),
    db.vendor.findUnique({
      where: { id: line.vendorId },
      select: { slug: true },
    }),
  ])

  await db.$transaction(async tx => {
    await tx.review.create({
      data: {
        orderId: validated.orderId,
        productId: validated.productId,
        vendorId: line.vendorId,
        customerId: session.user.id,
        rating: validated.rating,
        body: trimmedBody || null,
      },
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
