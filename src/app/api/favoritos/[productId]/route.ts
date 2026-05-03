import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { FAVORITES_UNAVAILABLE_MESSAGE, isFavoritesTableMissingError } from '@/domains/catalog/favorites'
import { zCuid } from '@/lib/validation/primitives'

interface RouteParams {
  params: Promise<{ productId: string }>
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idCheck = zCuid.safeParse((await params).productId)
    if (!idCheck.success) {
      return NextResponse.json({ error: 'Identificador inválido' }, { status: 400 })
    }
    const productId = idCheck.data

    // Verify ownership before deleting
    const favorite = await db.favorite.findUnique({
      where: {
        userId_productId: {
          userId: session.user.id,
          productId,
        },
      },
    })

    if (!favorite) {
      return NextResponse.json(
        { error: 'Favorito no encontrado' },
        { status: 404 }
      )
    }

    await db.favorite.delete({
      where: {
        userId_productId: {
          userId: session.user.id,
          productId,
        },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isFavoritesTableMissingError(error)) {
      return NextResponse.json(
        { error: FAVORITES_UNAVAILABLE_MESSAGE },
        { status: 503 }
      )
    }

    logger.error('api.favoritos.delete_failed', { error })
    return NextResponse.json(
      { error: 'Error al eliminar favorito' },
      { status: 500 }
    )
  }
}
