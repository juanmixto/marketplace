import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  FAVORITES_UNAVAILABLE_MESSAGE,
  isFavoritesTableMissingError,
  withFavoritesGuard,
} from '@/lib/favorites'

const addVendorFavoriteSchema = z.object({
  vendorId: z.string().min(1),
})

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { value: favorites, unavailable } = await withFavoritesGuard(
      () =>
        db.vendorFavorite.findMany({
          where: { userId: session.user.id },
          include: {
            vendor: {
              select: {
                id: true,
                slug: true,
                displayName: true,
                logo: true,
                coverImage: true,
                location: true,
                description: true,
                avgRating: true,
                totalReviews: true,
                _count: { select: { products: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
      []
    )

    return NextResponse.json(favorites, unavailable ? { headers: { 'x-favorites-unavailable': 'true' } } : undefined)
  } catch (error) {
    console.error('GET /api/favoritos/vendors error:', error)
    return NextResponse.json({ error: 'Error al obtener favoritos' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { vendorId } = addVendorFavoriteSchema.parse(body)

    const vendor = await db.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true },
    })

    if (!vendor) {
      return NextResponse.json({ error: 'Productor no encontrado' }, { status: 404 })
    }

    await db.vendorFavorite.upsert({
      where: {
        userId_vendorId: {
          userId: session.user.id,
          vendorId,
        },
      },
      update: {},
      create: {
        userId: session.user.id,
        vendorId,
      },
    })

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', details: error.issues }, { status: 400 })
    }

    if (isFavoritesTableMissingError(error)) {
      return NextResponse.json({ error: FAVORITES_UNAVAILABLE_MESSAGE }, { status: 503 })
    }

    console.error('POST /api/favoritos/vendors error:', error)
    return NextResponse.json({ error: 'Error al añadir favorito' }, { status: 500 })
  }
}
