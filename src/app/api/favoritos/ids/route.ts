import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { withFavoritesGuard } from '@/lib/favorites'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ ids: [] })
    }

    const { value: favorites } = await withFavoritesGuard(
      () =>
        db.favorite.findMany({
          where: { userId: session.user.id },
          select: { productId: true },
        }),
      []
    )

    return NextResponse.json({ ids: favorites.map(f => f.productId) })
  } catch (error) {
    console.error('GET /api/favoritos/ids error:', error)
    return NextResponse.json({ ids: [] })
  }
}
