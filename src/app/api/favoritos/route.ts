import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

const addFavoriteSchema = z.object({
  productId: z.string().min(1),
})

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const favorites = await db.favorite.findMany({
      where: { userId: session.user.id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            images: true,
            basePrice: true,
            stock: true,
            vendor: {
              select: {
                displayName: true,
                slug: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(favorites)
  } catch (error) {
    console.error('GET /api/favoritos error:', error)
    return NextResponse.json(
      { error: 'Error al obtener favoritos' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { productId } = addFavoriteSchema.parse(body)

    // Verify product exists
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true },
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Producto no encontrado' },
        { status: 404 }
      )
    }

    // Upsert to avoid duplicates
    await db.favorite.upsert({
      where: {
        userId_productId: {
          userId: session.user.id,
          productId,
        },
      },
      update: {}, // Do nothing if already exists
      create: {
        userId: session.user.id,
        productId,
      },
    })

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Datos inválidos',
          details: error.issues,
        },
        { status: 400 }
      )
    }

    console.error('POST /api/favoritos error:', error)
    return NextResponse.json(
      { error: 'Error al añadir favorito' },
      { status: 500 }
    )
  }
}
