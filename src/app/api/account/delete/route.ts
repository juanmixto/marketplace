'use server'

/**
 * GDPR Article 17: Right to Be Forgotten
 * Anonimizes user account (legal: orders retained 5 years for tax compliance)
 */

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function DELETE() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    await db.$transaction([
      // Anonimize user (preserve foreign key integrity)
      db.user.update({
        where: { id: userId },
        data: {
          email: `deleted_${userId}@anon.invalid`,
          passwordHash: null,
          deletedAt: new Date(),
          emailVerified: null,
          firstName: 'Usuario',
          lastName: 'Eliminado',
          image: null,
        },
      }),
      // Delete addresses (not needed for tax compliance)
      db.address.deleteMany({ where: { userId } }),
      // Anonimize reviews (keep rating for products, remove text & author identity)
      db.review.updateMany({
        where: { customerId: userId },
        data: { body: null },
      }),
      // Delete sessions (invalidate all active sessions)
      db.session.deleteMany({ where: { userId } }),
    ])

    return NextResponse.json({
      success: true,
      message: 'Cuenta eliminada y anonimizada correctamente',
    })
  } catch (error) {
    console.error('[GDPR Delete] Error:', error)
    return NextResponse.json(
      { error: 'Error al eliminar la cuenta' },
      { status: 500 }
    )
  }
}
