'use server'

/**
 * GDPR Article 15: Right of Access
 * Exports all personal data for authenticated user
 */

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/ratelimit'

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const userId = session.user.id

  const rateLimitResult = await checkRateLimit('account-export', userId, 3, 3600)
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: rateLimitResult.message ?? 'Demasiadas solicitudes' },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString(),
          'X-RateLimit-Limit': '3',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
        },
      }
    )
  }

  try {
    const [user, addresses, orders, reviews, incidents] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          emailVerified: true,
          role: true,
          createdAt: true,
          deletedAt: true,
        },
      }),
      db.address.findMany({
        where: { userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          line1: true,
          line2: true,
          city: true,
          province: true,
          postalCode: true,
          isDefault: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.order.findMany({
        where: { customerId: userId },
        orderBy: { placedAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          subtotal: true,
          shippingCost: true,
          taxAmount: true,
          grandTotal: true,
          notes: true,
          placedAt: true,
          updatedAt: true,
          lines: {
            select: {
              id: true,
              productId: true,
              variantId: true,
              quantity: true,
              unitPrice: true,
              taxRate: true,
              productSnapshot: true,
              createdAt: true,
            },
          },
          payments: {
            select: {
              id: true,
              provider: true,
              status: true,
              amount: true,
              currency: true,
              createdAt: true,
            },
          },
          fulfillments: {
            select: {
              id: true,
              status: true,
              trackingNumber: true,
              carrier: true,
              shippedAt: true,
              deliveredAt: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      }),
      db.review.findMany({
        where: { customerId: userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          rating: true,
          body: true,
          createdAt: true,
          product: { select: { id: true, name: true } },
          order: { select: { orderNumber: true } },
        },
      }),
      db.incident.findMany({
        where: { customerId: userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          status: true,
          description: true,
          resolution: true,
          resolvedAt: true,
          createdAt: true,
          updatedAt: true,
          order: { select: { orderNumber: true } },
          messages: {
            select: {
              id: true,
              authorId: true,
              body: true,
              createdAt: true,
            },
          },
        },
      }),
    ])

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      user,
      addresses,
      orders,
      reviews,
      incidents,
    }

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="mis-datos-${userId}.json"`,
      },
    })
  } catch (error) {
    logger.error('gdpr.export.failed', { error })
    return NextResponse.json(
      { error: 'Error al exportar datos' },
      { status: 500 }
    )
  }
}
