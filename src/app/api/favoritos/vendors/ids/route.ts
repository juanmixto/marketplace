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
        db.vendorFavorite.findMany({
          where: { userId: session.user.id },
          select: { vendorId: true },
        }),
      []
    )

    return NextResponse.json({ ids: favorites.map(f => f.vendorId) })
  } catch (error) {
    console.error('GET /api/favoritos/vendors/ids error:', error)
    return NextResponse.json({ ids: [] })
  }
}
