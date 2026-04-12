import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { FAVORITES_UNAVAILABLE_MESSAGE, isFavoritesTableMissingError } from '@/lib/favorites'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ vendorId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { vendorId } = await params

    const existing = await db.vendorFavorite.findUnique({
      where: {
        userId_vendorId: {
          userId: session.user.id,
          vendorId,
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Favorito no encontrado' }, { status: 404 })
    }

    await db.vendorFavorite.delete({ where: { id: existing.id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isFavoritesTableMissingError(error)) {
      return NextResponse.json({ error: FAVORITES_UNAVAILABLE_MESSAGE }, { status: 503 })
    }

    console.error('DELETE /api/favoritos/vendors/[vendorId] error:', error)
    return NextResponse.json({ error: 'Error al eliminar favorito' }, { status: 500 })
  }
}
