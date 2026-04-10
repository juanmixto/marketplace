'use server'

/**
 * GDPR Article 15: Right of Access
 * Exports all personal data for authenticated user
 */

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const userId = session.user.id

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
        include: {
          lines: true,
          payments: true,
          fulfillments: true,
        },
      }),
      db.review.findMany({
        where: { customerId: userId },
        include: {
          product: { select: { name: true, id: true } },
          order: { select: { orderNumber: true } },
        },
      }),
      db.incident.findMany({
        where: { customerId: userId },
        include: {
          order: { select: { orderNumber: true } },
          messages: true,
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
    console.error('[GDPR Export] Error:', error)
    return NextResponse.json(
      { error: 'Error al exportar datos' },
      { status: 500 }
    )
  }
}
