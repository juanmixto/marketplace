/**
 * GDPR Article 15 export payload.
 *
 * Centralised here so both the /api/account/export/claim endpoint and
 * any future admin-initiated export (e.g. a DPO tool) use the same
 * shape. Returns null when the user record is missing.
 */

import { db } from '@/lib/db'

export async function buildAccountExportPayload(userId: string) {
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

  if (!user) return null

  return {
    exportedAt: new Date().toISOString(),
    user,
    addresses,
    orders,
    reviews,
    incidents,
  }
}
